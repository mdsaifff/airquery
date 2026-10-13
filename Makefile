.PHONY: dev dev-web dev-agent test lint data eval

# Fresh clone: install web deps on first use. uv syncs Python deps by itself.
web/node_modules: web/package-lock.json
	cd web && npm ci
	touch web/node_modules

dev: web/node_modules
	$(MAKE) -j2 dev-web dev-agent

dev-web:
	cd web && npm run dev

dev-agent:
	cd agent && uv run uvicorn main:app --reload --port 8000

test: web/node_modules
	cd web && npm test
	cd agent && uv run pytest -q
	cd data_prep && uv run pytest -q

lint: web/node_modules
	cd web && npm run lint
	cd agent && uv run ruff check . && uv run ruff format --check .
	cd data_prep && uv run ruff check . && uv run ruff format --check .

data:
	cd data_prep && uv run python quakes.py && uv run python coastlines.py

eval:
	@echo "eval: not set up yet (T4.1)"
