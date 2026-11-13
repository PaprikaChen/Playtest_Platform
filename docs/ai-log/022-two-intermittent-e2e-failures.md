---
id: 022
date: 2026-11-13
issue: null
agent: claude-code
model: claude-opus-5-5
type: bugfix
commits: [6d28880, 5669452, cfa3624]
outcome: accepted
human_corrections: 0
caught_by: [browser-test]
---
## Requirement
PR #43's E2E failed on CI (Auto-fix): the recall-cards test expected "Thanks for playtesting" after Submit.

## Prompt
None directly: Auto-fix on PR #43 (enabled by Amilia) reported the failing `e2e` check.

## What the AI did
- Read the CI page snapshot: the page showed "Feedback already submitted", so the submit had worked. The same test had
  failed once locally before without a diagnosis (log 021).
- First guess (dev server unloading idle pages, `onDemandEntries`) was applied, then **reverted**: it did not stop
  the failure and was never proven.
- Repeated full runs with traces reproduced two different intermittent failures:
  1. **Refresh after submit.** The trace showed an `?_rsc=` request 130 ms after the submit POST: a server refresh.
     The survey page returned a different tree once submitted, wiping the client's thank-you state. Fix: always render
     `SurveyPage` and pass `alreadySubmitted`. E2E forces it with `window.next.router.refresh()` (failed before, 3/3 after).
  2. **Input before hydration.** The main flow hung 180 s: "Start playtest" was "not enabled" because "I agree" was
     checked before React hydrated. Fix: the consent form is disabled until hydrated. E2E delays the JS chunks by 3 s
     (failed before, 3/3 after). A wrapper briefly broke the form spacing; caught in the screenshot and fixed.

## Validation
- `npm run check` (45 unit), typecheck, lint. Full `npm run e2e` 3 runs in a row: 15/15 each.

## Not verified
- CI result for these commits (pushed with this entry).

## Lesson
Two different flakes hid behind one red check; traces (network + action log), not guesses, found both. A guess that
did not reproduce the fix got reverted rather than left in as "might help".
