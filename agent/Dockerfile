# AirQuery agent. Build from the repo root so the schema files can be copied in:
#   docker build -f agent/Dockerfile -t airquery-agent .
#   docker run --env-file agent/.env -p 8000:8000 airquery-agent
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependencies first (cached layer), then the code.
COPY agent/pyproject.toml agent/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY agent/ ./
COPY web/public/data/*.schema.json ./data/

ENV PATH="/app/.venv/bin:$PATH" \
    SCHEMA_DIR=/app/data \
    PORT=8000
EXPOSE 8000

# Hosts like Render / Cloud Run / Fly set PORT.
# --forwarded-allow-ips: behind the host's proxy, take the visitor IP from X-Forwarded-For
# (otherwise every visitor shares the proxy's IP and its per-visitor limits).
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --forwarded-allow-ips='*'"]
