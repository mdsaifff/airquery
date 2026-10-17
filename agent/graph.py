"""LangGraph pipeline: parse -> validate -> (repair | clarify/reject) -> merge -> compile.

The LLM only proposes a spec. Nothing leaves this graph unless it passed both
Pydantic and validate_spec, and only compile_sql produces SQL.
"""

import time
from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import ValidationError

from compile_sql import compile_spec
from llm import LLMAdapter
from merge import merge
from prompt_builder import build_prompt
from spec import DatasetSchema, Pointer, QuerySpec, Scalar
from validate import validate_spec

MAX_RETRIES = 2
BUSY = "The AI is busy right now; ask again in a minute."

Status = Literal["ok", "clarify", "rejected"]

# Errors that mean "this dataset can't do that" rather than "say it differently".
IMPOSSIBLE_MARKERS = ("unknown field", "does not fit", "color_by", "size_by", "unknown sort")


class AgentState(TypedDict, total=False):
    schema: DatasetSchema
    utterance: str
    prev_spec: QuerySpec | None
    pointer: Pointer | None  # where the user pointed ("here"), if anywhere
    candidate_spec: dict[str, Any] | None  # raw LLM proposal, unvalidated
    spec: QuerySpec | None  # validated (then merged) spec
    errors: list[str]
    retries: int
    status: Status | None
    message: str | None
    sql: str | None
    params: list[Scalar]
    timings_ms: dict[str, float]
    tokens: dict[str, int]


def _ms(t0: float) -> float:
    return round((time.perf_counter() - t0) * 1000, 1)


def _add_timing(state: AgentState, key: str, ms: float) -> dict[str, float]:
    timings = dict(state.get("timings_ms") or {})
    timings[key] = round(timings.get(key, 0.0) + ms, 1)
    return timings


def _pydantic_errors(err: ValidationError) -> list[str]:
    return [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in err.errors()]


def filterable(schema: DatasetSchema) -> str:
    return ", ".join(c.name for c in schema.columns)


def build_graph(llm: LLMAdapter, max_retries: int = MAX_RETRIES):
    async def parse(state: AgentState) -> AgentState:
        schema = state["schema"]
        repairing = bool(state.get("errors"))
        prompt = build_prompt(
            schema,
            state["utterance"],
            state.get("prev_spec"),
            pointer=state.get("pointer"),
            previous=state.get("candidate_spec") if repairing else None,
            errors=state.get("errors") if repairing else None,
        )
        t0 = time.perf_counter()
        try:
            reply = await llm.complete(prompt)
        except Exception as exc:  # provider down, bad key, timeout...
            if "RateLimit" in type(exc).__name__:  # the provider's own per-minute limit
                return {
                    "status": "clarify",
                    "message": BUSY,
                    "timings_ms": _add_timing(state, "llm", _ms(t0)),
                }
            return {
                "status": "rejected",
                "message": f"The language model is unavailable ({type(exc).__name__}).",
                "timings_ms": _add_timing(state, "llm", _ms(t0)),
            }
        tokens = dict(state.get("tokens") or {})
        tokens["input"] = tokens.get("input", 0) + reply.input_tokens
        tokens["output"] = tokens.get("output", 0) + reply.output_tokens
        update: AgentState = {"timings_ms": _add_timing(state, "llm", _ms(t0)), "tokens": tokens}
        if reply.clarify or reply.spec is None:
            update |= {
                "status": "clarify",
                "message": reply.clarify or "Could you rephrase that?",
                "errors": [],
            }
        else:
            update["candidate_spec"] = reply.spec
        return update

    def validate(state: AgentState) -> AgentState:
        t0 = time.perf_counter()
        try:
            spec = QuerySpec.model_validate(state["candidate_spec"])
            errors = validate_spec(spec, state["schema"])
        except ValidationError as err:
            spec, errors = None, _pydantic_errors(err)
        return {
            "spec": None if errors else spec,
            "errors": errors,
            "timings_ms": _add_timing(state, "validate", _ms(t0)),
        }

    def repair(state: AgentState) -> AgentState:
        return {"retries": state.get("retries", 0) + 1}

    def give_up(state: AgentState) -> AgentState:
        errors = state.get("errors") or []
        first = errors[0] if errors else "invalid query"
        if any(m in e for e in errors for m in IMPOSSIBLE_MARKERS):
            return {
                "status": "rejected",
                "message": f"I can't do that with this data ({first}). "
                f"You can filter by: {filterable(state['schema'])}.",
            }
        return {"status": "clarify", "message": f"Could you say that another way? ({first})"}

    def merge_node(state: AgentState) -> AgentState:
        spec = state["spec"]
        assert spec is not None
        return {"spec": merge(state.get("prev_spec"), spec)}

    def compile_node(state: AgentState) -> AgentState:
        spec = state["spec"]
        assert spec is not None
        t0 = time.perf_counter()
        if spec.intent in ("undo", "reset", "timeline", "view"):  # handled in the browser
            return {"status": "ok", "sql": None, "params": []}
        query = compile_spec(spec, state["schema"])  # re-validates: defense in depth
        return {
            "status": "ok",
            "sql": query.sql,
            "params": query.params,
            "timings_ms": _add_timing(state, "compile", _ms(t0)),
        }

    def after_parse(state: AgentState) -> str:
        return "end" if state.get("status") else "validate"

    def after_validate(state: AgentState) -> str:
        if not state.get("errors"):
            return "merge"
        return "repair" if state.get("retries", 0) < max_retries else "give_up"

    g = StateGraph(AgentState)
    g.add_node("parse", parse)
    g.add_node("validate", validate)
    g.add_node("repair", repair)
    g.add_node("give_up", give_up)
    g.add_node("merge", merge_node)
    g.add_node("compile", compile_node)
    g.add_edge(START, "parse")
    g.add_conditional_edges("parse", after_parse, {"end": END, "validate": "validate"})
    g.add_conditional_edges(
        "validate", after_validate, {"merge": "merge", "repair": "repair", "give_up": "give_up"}
    )
    g.add_edge("repair", "parse")
    g.add_edge("give_up", END)
    g.add_edge("merge", "compile")
    g.add_edge("compile", END)
    return g.compile()


async def run_agent(
    graph: Any,
    schema: DatasetSchema,
    utterance: str,
    prev_spec: QuerySpec | None,
    pointer: Pointer | None = None,
) -> AgentState:
    """Run the graph once. A previous spec that fails validation is rejected up front."""
    t0 = time.perf_counter()
    if prev_spec is not None and (errors := validate_spec(prev_spec, schema)):
        state: AgentState = {
            "status": "rejected",
            "message": f"current_spec is not valid: {errors[0]}",
            "errors": errors,
            "retries": 0,
            "timings_ms": {},
        }
    else:
        initial: AgentState = {
            "schema": schema,
            "utterance": utterance,
            "prev_spec": prev_spec,
            "pointer": pointer,
            "errors": [],
            "retries": 0,
            "params": [],
            "timings_ms": {},
            "tokens": {},
        }
        state = await graph.ainvoke(initial)
    timings = dict(state.get("timings_ms") or {})
    timings["total"] = _ms(t0)
    return {**state, "timings_ms": timings}
