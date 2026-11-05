---
id: 007
date: 2026-11-05
issue: null
agent: claude-code
model: claude-opus-5-5
type: docs
commits: [fd45ee2]
outcome: accepted-with-fixes
human_corrections: 1
caught_by: [human]
---
## Requirement
Backlog in a task manager (title, description, status, priority, assignee), the alpha report, and an AI reflection.

## Prompt (faithful summary)
"GitHub Issues + Projects; Google Doc report; we work in shifts: I go first, then Paprika continues." Later: "You started
coding directly; we didn't build a really good workflow. How would you redesign it so the professor sees heavy, high-quality
LLM use?"

## What the AI did
- Created 29 issues with priority/status/area labels: done items assigned to Amilia and closed, next-shift items assigned
  to Paprika.
- Took screenshots and generated the report `.docx` for import into Google Docs.
- After the critique, proposed and built this workflow scaffolding: CLAUDE.md, decision records, this log, the log skill
  + Stop hook, issue/PR templates, and CI.

## Validation
Issues verified via `gh issue list`. The report was checked structurally (sections, 2 tables, 4 images); it could not be
rendered visually here.

## Human correction / what we learned
The human pointed out that the process itself was undocumented: one big commit, no PRs, tests written after the code, no
AI log, even though our proposal promised one. The scaffolding in this commit is the response.
