"""FastAPI app: POST /query (utterance -> validated spec + SQL), GET /health."""

import json
import time
from collections import OrderedDict, deque
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from graph import AgentState, build_graph, run_agent
from llm import LLMAdapter, LLMNotConfiguredError, make_llm
from schema_registry import SchemaRegistry, UnknownDatasetError
from settings import AGENT_DIR, settings
from spec import QueryRequest, QueryResponse

CACHE_SIZE = 256
DEFAULT_LOG = AGENT_DIR / "logs" / "queries.jsonl"


class RateLimiter:
    """Sliding one-minute window per client IP.

    ponytail: in-process memory; use a shared store (Redis) if the agent ever
    runs more than one worker.
    """

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self.hits: dict[str, deque[float]] = {}

    def allow(self, ip: str, now: float) -> bool:
        q = self.hits.setdefault(ip, deque())
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.per_minute:
            return False
        q.append(now)
        return True


class QueryLog:
    def __init__(self, path: Path) -> None:
        self.path = path

    def write(self, **fields: Any) -> None:
        ts = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": ts, **fields}, default=str) + "\n")


def _dump(spec: Any) -> Any:
    return spec.model_dump(mode="json") if spec is not None else None


def create_app(
    llm: LLMAdapter | None = None,
    registry: SchemaRegistry | None = None,
    log_path: Path = DEFAULT_LOG,
    rate_limit_per_min: int | None = None,
) -> FastAPI:
    llm_error = ""
    if llm is None:
        try:
            llm = make_llm(settings.llm_provider, settings.llm_model, settings.llm_api_key)
        except LLMNotConfiguredError as exc:
            llm_error = str(exc)
    registry = registry or SchemaRegistry.load(settings.schema_dir)
    graph = build_graph(llm) if llm else None
    limiter = RateLimiter(rate_limit_per_min or settings.rate_limit_per_min)
    cache: OrderedDict[tuple[str, str, str], QueryResponse] = OrderedDict()
    log = QueryLog(log_path)

    app = FastAPI(title="AirQuery agent")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    def respond(req: QueryRequest | None, resp: QueryResponse, code: int = 200, **extra: Any):
        log.write(
            dataset=req.dataset if req else None,
            utterance=req.utterance if req else None,
            prev_spec=_dump(req.current_spec) if req else None,
            spec=_dump(resp.spec),
            status=resp.status,
            errors=extra.pop("errors", []),
            retries=resp.retries,
            timings_ms=resp.timings_ms,
            cache_hit=extra.pop("cache_hit", False),
            model=llm.name if llm else None,
            **extra,
        )
        return JSONResponse(resp.model_dump(mode="json"), status_code=code)

    @app.exception_handler(RequestValidationError)
    async def bad_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        msg = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        resp = QueryResponse(status="rejected", message=f"Bad request: {msg}")
        if request.url.path != "/query":
            return JSONResponse(resp.model_dump(mode="json"), status_code=422)
        return respond(None, resp, 422, errors=[msg])

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/query")
    async def query(req: QueryRequest, request: Request) -> JSONResponse:
        t0 = time.perf_counter()
        ip = request.client.host if request.client else "unknown"
        if not limiter.allow(ip, time.monotonic()):
            resp = QueryResponse(status="rejected", message="Too many requests; wait a moment.")
            return respond(req, resp, 429, errors=["rate limited"])
        try:
            schema = registry.get(req.dataset)
        except UnknownDatasetError:
            resp = QueryResponse(status="rejected", message=f"Unknown dataset {req.dataset!r}.")
            return respond(req, resp, errors=["unknown dataset"])
        if graph is None:
            resp = QueryResponse(status="rejected", message=llm_error)
            return respond(req, resp, errors=["llm not configured"])

        prev_json = req.current_spec.model_dump_json() if req.current_spec else ""
        key = (req.dataset, " ".join(req.utterance.lower().split()), prev_json)
        if key in cache:
            cache.move_to_end(key)
            hit = cache[key].model_copy(
                update={"timings_ms": {"total": round((time.perf_counter() - t0) * 1000, 1)}}
            )
            return respond(req, hit, cache_hit=True)

        state: AgentState = await run_agent(graph, schema, req.utterance, req.current_spec)
        resp = QueryResponse(
            status=state.get("status") or "rejected",
            spec=state.get("spec") if state.get("status") == "ok" else None,
            sql=state.get("sql"),
            params=state.get("params") or [],
            message=state.get("message"),
            retries=state.get("retries", 0),
            timings_ms=state.get("timings_ms") or {},
        )
        if resp.status != "rejected":  # rejections may be transient (provider down)
            cache[key] = resp
            if len(cache) > CACHE_SIZE:
                cache.popitem(last=False)
        return respond(req, resp, errors=state.get("errors") or [], tokens=state.get("tokens"))

    return app


app = create_app()
