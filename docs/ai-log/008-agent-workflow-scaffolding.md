---
id: 008
date: 2026-11-05
issue: null
agent: claude-code
model: claude-opus-5-5
type: infra
commits: [e1fc0af]
outcome: accepted-with-fixes
human_corrections: 0
caught_by: [type-check]
---
## Requirement
Make the AI workflow explicit and verifiable: agent context, design records, an AI task log that can't be skipped,
issue/PR templates and CI.

## Prompt
"Yes, set it up" (accepting the workflow proposal in entry 007).

## What the AI did
- Wrote CLAUDE.md, decision records 0001–0003, and back-filled AI log entries 001–007.
- Added the `log-ai-task` skill and a Stop hook (`scripts/check-ai-log.mjs`), plus `npm run ai-log:stats`.
- Added the issue/PR templates, CI and an optional Claude PR review.

## Validation
- In a throwaway repo, the hook exits 2 for an unlogged agent commit, and 0 for human commits and when
  `stop_hook_active` is set.
- `NEXT_DIST_DIR=.next-build npm run build` succeeds. Tests (16), typecheck and lint pass.
- The first commit attempt failed lint because ESLint scanned the new build folder. Fixed by ignoring `.next-build/` and
  `data/` (uploaded games).

**Not verified:** the CI workflows have not run yet. They run on the first PR. The Claude review job is skipped until an
`ANTHROPIC_API_KEY` secret exists.

## Human correction / what we learned
The commit you're reading is the first one the Stop hook would have blocked without this entry, so the workflow
enforced itself on its own author.
