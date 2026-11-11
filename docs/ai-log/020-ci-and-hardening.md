---
id: 020
date: 2026-11-11
issue: null
agent: claude-code
model: claude-opus-5-5
type: bugfix
commits: [d6b290b, 78503e7, 2334c9c, cc66282]
outcome: accepted
human_corrections: 0
caught_by: [review, browser-test]
---
## Requirement
Quick fixes picked after reviewing main on 2026-11-11: CI fails on network flakes; two bugs Paprika noted while
reviewing #30 (a turned-off invite still lets started sessions write; `.br`/`.gz` decompression has no limit); the AI
summary buttons have no browser test.

## Prompt
(translated from Chinese) "Yes, quick fixes first."

## What the AI did
- CI: `ONNXRUNTIME_NODE_INSTALL=skip` (npm ci was downloading ~300 MB of unused CUDA binaries from nuget.org, which
  timed out once); fonts self-hosted with `next/font/local` (`next/font/google` failed one build).
- Tests first for both bugs. `requireTesterSession` now checks `invite.active`. `decodePrecompressed` caps the inflated
  size at the ZIP limit (200 MB) and returns 422.
- Found while fixing: with the link off, the chunk uploader retried 403 forever and Finish would hang. It now stops
  on 400/403/404/409. The Finish error message was never visible (it only rendered while finishing); it now shows.
- `RECALL_PROVIDER=fixture` for E2E: keyword mock plus a fixed summary for notes tagged `#summary`, refused in
  production. New E2E: "Use this wording" → "Includes AI wording"; link turned off mid-session.

## Validation
- `npm run check`: 44/44 unit tests; `npm run build` passes with local fonts.
- `npm run e2e`: 13/13; the two new tests 3× in a row. Screenshots checked (`e2e-6-ai-wording-review.png`, fonts).
- First full run failed one new test: Next's own empty `role="alert"` route announcer matched the locator; fixed the
  locator, not the app.

## Not verified
- The CI env flag on GitHub's Linux runner (only verifiable when CI runs).

## Lesson
A fix that makes the server refuse can make the client hang; check what the caller does with the new error.
