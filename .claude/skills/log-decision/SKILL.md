---
name: log-decision
description: Append a short entry to docs/DECISIONS.md for a non-obvious technical choice. Use after choosing between libraries, designs or trade-offs.
argument-hint: "[short title]"
---

Add a decision to `docs/DECISIONS.md` titled `$ARGUMENTS` (or a title you
derive from the conversation).

- Number it one higher than the last `D-xxx` entry.
- Use the same four bullets as existing entries: Context, Decision, Why,
  Consequences. One or two lines each, plain words.
- Name the alternatives that were rejected and the main reason.
- Don't edit earlier entries. If a decision replaces an older one, say
  "Supersedes D-xxx" in Context.
