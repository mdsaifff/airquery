.PHONY: dev dev-web dev-agent test lint data eval contracts build preview docker-agent

# Fresh clone: install web deps on first use. uv syncs Python deps by itself.
# npm rewrites node_modules/.package-lock.json on every install, so this only
# reruns when package-lock.json changed since the last install.
WEB_DEPS := web/node_modules/.package-lock.json
$(WEB_DEPS): web/package-lock.json
	cd web && if [ -d node_modules ]; then npm install --no-audit --no-fund; else npm ci; fi
	touch $(WEB_DEPS)

dev: $(WEB_DEPS)
	$(MAKE) -j2 dev-web dev-agent

dev-web:
	cd web && npm run dev

dev-agent:
	cd agent && uv run uvicorn main:app --reload --port 8000

test: $(WEB_DEPS)
	cd web && npm test
	cd agent && uv run pytest -q
	cd data_prep && uv run pytest -q

lint: $(WEB_DEPS)
	cd web && npm run lint
	cd agent && uv run ruff check . && uv run ruff format --check .
	cd data_prep && uv run ruff check . && uv run ruff format --check .

data:
	cd data_prep && uv run python quakes.py && uv run python coastlines.py

eval:
	@echo "eval: not set up yet (T4.1)"

# After changing agent/spec.py: JSON Schema first, then the TS types.
contracts: $(WEB_DEPS)
	cd agent && uv run python scripts/export_schema.py
	cd web && node scripts/gen-contracts.ts

# Production: static web build (set VITE_AGENT_URL to the deployed agent) and agent image.
build: $(WEB_DEPS)
	cd web && npm run build

preview: build
	cd web && npx vite preview --port 4173 --strictPort

docker-agent:
	docker build -f agent/Dockerfile -t airquery-agent .
