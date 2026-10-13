# AirQuery

Explore a 3D dataset with your hands and ask questions out loud.

Work in progress. See `docs/PRD.md` for the spec and `docs/TASKS.md` for progress.

## Run locally

Needs Node.js LTS, Python 3.12, [uv](https://docs.astral.sh/uv/) and GNU make.

```bash
cp agent/.env.example agent/.env   # then set LLM_PROVIDER / LLM_MODEL / LLM_API_KEY
make dev    # web on http://localhost:5173, agent on http://localhost:8000
make test
make lint
```

No API key yet? `cd agent && uv run python scripts/fake_agent.py` serves the real
agent with a keyword-matching stand-in for the LLM (understands "deeper than 300",
"colour them by magnitude", "the ten strongest", "near Japan", "undo", ...).

Keyboard: hold **space** to talk, **R** reset view, **Z** undo, **D** debug panel
(dev), **Shift+R** record a landmark fixture (dev). Mouse: drag to rotate, wheel to zoom.

## Deploy

Two pieces, deployed separately:

| Piece | What | Build |
| --- | --- | --- |
| Web | Static files (`web/dist`) | `VITE_AGENT_URL=https://<agent-host> make build` |
| Agent | Docker image (FastAPI) | `make docker-agent` (= `docker build -f agent/Dockerfile -t airquery-agent .`) |

Check a production build locally against a local agent:

```bash
make docker-agent && docker run --env-file agent/.env -p 8000:8000 airquery-agent
VITE_AGENT_URL=http://localhost:8000 make preview      # http://localhost:4173
```

Agent environment variables (set as secrets on the host, never in the web build):
`LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `WEB_ORIGIN` (comma-separated allowed
origins, e.g. `https://airquery.example`), `RATE_LIMIT_PER_MIN`. The image reads
its `DatasetSchema` files from `/app/data` and listens on `$PORT` (default 8000).

### Host options

Web (static): **Netlify**, **Vercel** or **GitHub Pages** all work. The DuckDB-Wasm
binaries are ~36–41 MB each, so **Cloudflare Pages** (25 MiB per-file limit) does
not, unless DuckDB is switched to its jsDelivr bundles.

Agent (container):

| Host | Notes |
| --- | --- |
| Google Cloud Run | Scales to zero; first request after idle pays a cold start (~1–3 s). Set min instances = 1 while recording. |
| Fly.io | Small always-on machine; low latency if the region is near you. |
| Render | Simple Docker deploys; free tier sleeps (slow first query). |
| Railway | Docker deploys from the repo; usage-based pricing. |

For the demo video, pick something that stays warm: cold starts would show up
in the voice→render counter.

### Privacy

Hand tracking runs fully in the browser; webcam frames never leave it. Only the
transcript text goes to the agent. Note that Chrome's Web Speech API sends audio
to Google for recognition (see `docs/DECISIONS.md`, D-004).
