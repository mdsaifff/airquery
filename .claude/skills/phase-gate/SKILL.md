---
name: phase-gate
description: Check whether a phase's gate in docs/TASKS.md is met before moving on to the next phase.
argument-hint: "[phase-number]"
disable-model-invocation: true
---

Check the Gate for phase `$ARGUMENTS` in `docs/TASKS.md` (if no number was
given, use the "Current phase" line).

1. List every task in that phase and whether it is ticked.
2. For each gate criterion, say how it can be verified:
   - **Automated:** run it now (`make lint`, `make test`, builds, scripts) and
     report pass or fail with the evidence.
   - **Human:** turn it into a short checklist for the user. Do not mark it
     met until the user confirms.
3. Give a verdict: **met** or **not met**, with the blocking items.
4. Only if the user confirms the gate is met: update the "Current phase" line
   in `docs/TASKS.md` to the next phase and commit with
   `chore(tasks): pass gate <n>`.
