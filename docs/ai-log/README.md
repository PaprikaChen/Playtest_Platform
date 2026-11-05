# AI task log

Our proposal committed to keeping, for every AI task: **the requirement, the actual prompt, the code change, the validation
result, and the human correction.** This folder is that record. One file per task: `NNN-short-slug.md`.

- Agents write entries with the `/log-ai-task` skill (`.claude/skills/log-ai-task/`).
- A Claude Code Stop hook (`scripts/check-ai-log.mjs`) refuses to end a session while the latest agent-authored commit
  isn't referenced by any entry.
- `npm run ai-log:stats` aggregates the frontmatter into the numbers we report (tasks, outcomes, human corrections, bugs
  caught by verification).

## Entry format

```markdown
---
id: 012
date: 2026-11-05
issue: 18                    # GitHub issue number, or null
agent: claude-code           # claude-code | chatgpt | copilot | cursor | …
model: claude-opus-5-5
type: feature                # design | feature | bugfix | test | docs | infra | eval
commits: [abc1234]
outcome: accepted-with-fixes # accepted | accepted-with-fixes | rejected
human_corrections: 1         # times a human changed direction or fixed the output
caught_by: [browser-test]    # how defects were found: unit-test | browser-test | type-check | review | human
---
## Requirement
## Prompt (verbatim or faithful summary; say which)
## What the AI did
## Validation
## Human correction / what we learned
```
