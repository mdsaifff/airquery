---
name: verify
description: Run the project's lint and test checks and report failures. Use before every commit and whenever asked to check that the code still works.
allowed-tools: Bash(make lint) Bash(make test)
---

Run the AirQuery checks from the repository root:

1. `make lint`
2. `make test`

If a Makefile target doesn't exist yet, say which one is missing and run the
equivalent commands that do exist in `web/` (`npm run lint`, `npm test`) and
in `agent/` (`uv run ruff check .`, `uv run pytest`).

Report one line per check: pass or fail. For failures, show the first error
of each kind with file and line, fix what is clearly in scope of the current
change, and rerun. Don't commit while anything fails. Don't silence a failing
test or lint rule to make it pass; if a rule seems wrong, ask.
