---
id: 004
date: 2026-11-04
issue: null
agent: claude-code
model: claude-opus-5-5
type: bugfix
commits: [2bf7a65]
outcome: accepted
human_corrections: 0
caught_by: [browser-test]
---
## Requirement
App pages render without errors.

## Prompt
Agent-initiated while driving the app in the browser.

## What the AI did
Typecheck, lint and unit tests were all green, yet the browser showed three defects:
1. **HTTP 500 on every page.** Tailwind v4 refuses `@apply btn` inside `.btn-primary` (a custom class applying another
   custom class). Fixed by inlining the base utilities.
2. **Server → client prop error.** `node:sqlite` returns null-prototype row objects, which React cannot serialize to
   client components. Fixed by copying rows into plain objects in `db.ts`.
3. **Hydration mismatches.** The invite URL used `window.location.origin`, and the speech-support check ran during
   render. Both now run in `useEffect`.

## Validation
The pages were re-loaded and the console checked; no errors remained.

## Human correction / what we learned
Static checks don't cover framework runtime rules. Each of these appeared only when a real browser ran the page.
"Verify in a browser" is now a required workflow step for UI changes.
