---
id: 009
date: 2026-11-05
issue: 22
agent: claude-code
model: claude-opus-5-5
type: bugfix
commits: [ea45e1c]
outcome: accepted-with-fixes
human_corrections: 1
caught_by: [review, browser-test, unit-test]
---
## Requirement
Before pushing anything else: find the real bugs, make the hard-to-test parts (screen + voice) testable, show the UI, and
answer honestly whether voice input works well.

## Prompt (faithful summary, translated from Chinese)
"I want to confirm everything is right before pushing. Hold the GitHub changes (board) until the rest is done. Find
bugs, since this is hard to test. Show me the UI. Are you sure voice input is done well?"

## What the AI did
- Ran a high-effort code review of `main...alpha-release` and found 10 issues. Five were in voice/recording:
  - duplicated or lost comments at Finish
  - live-caption end times dropped
  - stopping screen share killed the mic recording
  - a caption restart loop
  - upload backoff never reset
- Built a Playwright E2E test in **real Chrome** with fake screen capture and a fake mic that plays synthesized speech.
  It covers creator setup, tester play, a simulated "Stop sharing" at 8 s, recall cards, survey reload, and developer
  review, and saves screenshots.
- Fixed all 10 issues, plus Start being clickable twice with no feedback while permissions are pending (found by the E2E
  hanging) and a "1 comments" label.

## Validation
- `npm test`: 17 passed (a new zip-bomb test). Typecheck and lint are clean.
- `npm run e2e` passes:
  - double-click creates 1 session
  - after the screen share stops, the recording is still 24.6 s, with audio decoding at 18 s
  - survey drafts survive a reload
- **Not verified:** live captions. Chrome's Web Speech API ignores the fake audio file (always `no-speech`, headless and
  headed), so captions can only be tested by a person speaking into a real mic. AssemblyAI has also not been run with a
  real key.

## Human correction / what we learned
The human pushed back on the claim that the work was done and asked for proof that voice works. The proof showed voice
*recording* works, but voice *to text* is unverified and Chrome-only. Lesson: say which features were verified and which
were only written.
