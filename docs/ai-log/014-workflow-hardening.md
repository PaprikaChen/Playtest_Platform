---
id: 014
date: 2026-11-05
issue: null
agent: claude-code
model: claude-opus-5-5
type: infra
commits: []
outcome: accepted
human_corrections: 0
caught_by: [unit-test, browser-test]
---
## Requirement
Keep the workflow basically the same, but close the gaps this session exposed so they don't recur, and prepare the
handoff to the next shift (Paprika).

## Prompt (faithful summary, translated from Chinese)
"We found places the process could improve. Now that things are debugged, see how the whole workflow can be made more
complete, without changing it much, so other problems don't come up later. And can making the board public wait until
my teammate has taken over and we're done?"

## What the AI did
Mapped each process problem from this session to a fix:
- **Pushed before the human confirmed:** a `.githooks/pre-push` hook runs `npm run check`; CLAUDE.md says to push only
  on the human's OK and to batch GitHub-visible changes.
- **typecheck failed randomly** (TS6053 from generated `.next*` types): `tsconfig.typecheck.json` checks sources only.
- **`npm run lint` locally reported 1000+ errors** from generated folders. CI never saw them because those folders don't
  exist there, and the agent had been linting hand-picked directories. Ignores fixed.
- **The AI-log hook checked only HEAD:** it now checks every agent commit on the branch (tested in a throwaway repo).
  The commit IDs in entries 009–013 were filled in.
- **E2E only ran locally:** a CI `e2e` job (Chromium + fake media) that uploads its screenshots.
- **UI judged only by its author:** UI and edge-case checklists in CLAUDE.md; the PR template asks for both.
- **Shift handoff had no format:** `docs/HANDOFF.md` + a `shift-handoff` skill.
- **Agents can't answer interactive prompts:** a gotcha recorded, with the device-code workaround.

## Bugs found while doing it
Running the main E2E alone made it fail intermittently. Both causes were real races, not test noise:
1. The survey showed **"Draft saved" while the latest edit was still waiting** for its 1 s autosave, so reloading lost
   it. Now it shows "Saving…" immediately, and pending edits are flushed on `pagehide` with a keepalive request.
2. With no `?tab=` in the URL, a refresh after an upload **switched the game page to another tab** under the user.
   It now redirects once to an explicit tab, so the view stays put.

## Validation
`npm run check` (31 unit tests), `npm run e2e` (7, and the main flow 3× in a row), and the production build all pass.
The pre-push hook passes; the AI-log hook passes on this branch and blocks the multi-commit case.

**Not verified:** the new CI `e2e` job hasn't run yet (it runs on the next push).

## Human correction / what we learned
A flaky test was a real bug twice. The rule now in CLAUDE.md: run it 3× and find the cause; never add retries to hide it.
