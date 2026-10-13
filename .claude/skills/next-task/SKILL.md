---
name: next-task
description: Pick up the next unchecked task from docs/TASKS.md (or the given task id), plan it, implement it with tests, verify, tick it off and commit.
argument-hint: "[task-id, e.g. T2.3]"
disable-model-invocation: true
---

Work on task `$ARGUMENTS` from `docs/TASKS.md`. If no id was given, take the
first unchecked task in the phase named on the "Current phase" line.

Follow these steps in order. Apply them for the whole task, not just the start.

1. **Load context.** Read the task in `docs/TASKS.md`. Read only the doc
   sections it references (`docs/PRD.md`, `docs/ARCHITECTURE.md`,
   `docs/DECISIONS.md`). Check `git status`; if the tree is dirty, stop and
   ask what to do with the existing changes.
2. **Check the gate.** If the previous phase's Gate isn't met, say so and stop.
3. **Restate.** In two or three lines: what you'll build and the "Done when"
   criteria you'll check. If the task says to ask the user something first
   (for example the LLM provider in T3.4), ask now and wait.
4. **Branch.** Create `t<id>-<short-name>` from the default branch.
5. **Plan.** If the change touches more than three files, list the files and
   the approach and wait for a go-ahead. Otherwise proceed.
6. **Implement** in small steps. Write tests next to the code as you go. Keep
   to the hard rules in `CLAUDE.md`. Put tunable numbers in `web/src/config.ts`.
7. **Verify.** Run `make lint` and `make test` and fix failures. For UI work,
   start the app and describe exactly what should appear on screen.
8. **Hand over human checks.** If the task has a "Needs you" line, print it as
   a numbered checklist and stop until the user reports back. Never claim a
   camera, microphone or feel check passed.
9. **Close out.** Tick the task in `docs/TASKS.md`; add a short indented note
   if anything deviated from the plan. If you made a non-obvious choice, add
   an entry to `docs/DECISIONS.md`. Commit with a conventional message.
10. **Report** in five lines or fewer: what was built, what was verified, what
    the user still needs to do, and the next task id.
