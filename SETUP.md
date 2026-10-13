# How to use this kit with Claude Code

This folder is the starting point of the AirQuery repository. It contains no
application code yet: it gives Claude Code the spec, the contracts, a phased
task list, and a few project skills so each session produces focused,
tested work. Delete this file once you're set up, or keep it for reference.

## What's inside

| File | What it does |
| --- | --- |
| `CLAUDE.md` | Loaded into every Claude Code session: what the project is, layout, commands, hard rules, how to work a task |
| `docs/PRD.md` | Product spec: hero demo, scope, gestures, voice intents, datasets, targets |
| `docs/ARCHITECTURE.md` | Components, allowed dependencies, data files, the `QuerySpec` and API contracts, state machine, latency budget |
| `docs/TASKS.md` | The to-do list: 5 phases, ~35 tasks, each with "Done when" criteria and "Needs you" checks, plus phase gates |
| `docs/DECISIONS.md` | Decision log, seeded with the six choices already made |
| `docs/EVAL.md` | How to measure performance, gesture accuracy, query accuracy, and the hands-vs-mouse study |
| `.claude/skills/next-task/` | `/next-task [id]`: plan, build, test, tick off and commit one task |
| `.claude/skills/phase-gate/` | `/phase-gate [n]`: check a phase gate before moving on |
| `.claude/skills/log-decision/` | `/log-decision [title]`: add a decision entry |
| `.claude/skills/verify/` | `/verify`: run lint and tests; Claude also runs it before commits |
| `.claude/rules/*.md` | Extra rules that load only when Claude touches `web/`, `agent/` or `data_prep/` |
| `.claude/agents/reviewer.md` | A read-only reviewer subagent that checks a diff against the rules |
| `.claude/settings.json` | Pre-approves safe commands (make, npm run, uv run, git status/diff), blocks reading `.env` |

## Before you start

Install: Git, Node.js LTS, Python 3.12, [uv](https://docs.astral.sh/uv/),
Chrome, and Claude Code ([setup guide](https://code.claude.com/docs/en/setup)).
You'll also need a webcam, a microphone, and later an API key for the LLM
provider you choose in task T3.4.

## Setup (5 minutes)

```bash
mkdir airquery && cd airquery
# copy everything from this kit into the folder (including the hidden .claude/)
git init
git add . && git commit -m "chore: project kit for Claude Code"
claude
```

In the first session, check that the instructions loaded: run `/context` and
look for `CLAUDE.md` under Memory files. Then type `/next-task T0.1`.

## The working loop

1. `/next-task` (or `/next-task T2.3` for a specific one).
2. Approve the plan if Claude shows one. Approve commands as they come up.
3. When Claude stops with a **Needs you** checklist, do it (camera, mic,
   recording fixtures, API keys) and report back in plain words.
4. Before the commit, optionally say "use the reviewer agent on this branch".
5. Run `/clear` before the next task so each task starts with a clean context.
6. At the end of a phase, run `/phase-gate`.

## Tips that make a big difference

- **One task per session.** Long sessions drift; `/clear` is cheap.
- **Correct early.** If Claude heads the wrong way, interrupt and redirect.
- **Feed it your observations.** "Pinch triggers when my hand is far from the
  camera" is a better prompt than "fix pinch".
- **Record fixtures in T1.3 properly.** Gesture tests run on them, so Claude
  can tune gestures without seeing your camera.
- **When Claude repeats a mistake**, ask it to add a line to `CLAUDE.md` (or
  the matching `.claude/rules/` file) so it won't happen again.
- **Keep `docs/TASKS.md` honest.** It's both Claude's queue and your progress
  log for the LinkedIn posts.

## Things only you can do

- Allow camera and microphone in the browser and judge how gestures feel
- Record landmark fixtures and the demo videos
- Choose the LLM provider and put the key in `agent/.env`
- Create the GitHub repo, hosting accounts and deployment secrets
- Run the user study with other people
