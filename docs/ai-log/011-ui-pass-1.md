---
id: 011
date: 2026-11-05
issue: null
agent: claude-code
model: claude-opus-5-5
type: feature
commits: [5d71bf2]
outcome: accepted-with-fixes
human_corrections: 0
caught_by: [browser-test]
---
## Requirement
A design pass on all screens, judged against screenshots rather than code.

## Prompt
"Yes, UI pass."

## What the AI did
- The design plugins (frontend-design / Design) weren't installed, so the agent ran the pass itself. It audited the E2E
  screenshots, wrote the critique and principles in `docs/design/ui-pass-1.md`, and saved "before" shots in
  `docs/screenshots/before-ui-pass/`.
- **Tester:**
  - Consent page with a two-step overview and explained capture options.
  - Play screen: the game scales to the stage; compact status bar (REC · time · **live mic meter** · upload health); a
    "think out loud" nudge after 90 s of silence.
  - Questionnaire: answer first, then a "From your playtest" strip of horizontal cards; server-rendered **ffmpeg
    thumbnails**; a sticky progress footer.
- **Creator:**
  - Project page puts feedback first, with setup in a sidebar and a getting-started checklist.
  - Compact questionnaire rows with an unsaved-changes indicator.
  - Review page has a **moment-marker strip** (spoken vs typed, click to seek).
- One accent token (indigo); red reserved for recording and destructive actions.

## Validation
- E2E passes after the redesign. A new assertion checks that thumbnails actually load (`naturalWidth > 0`).
- The first attempt used `<video poster>`, and screenshots still showed black frames. The route itself worked (frames
  cached on disk), so the cause was load timing. Switched to a lazily loaded `<img>` the test can wait on.
- Unit tests, typecheck and lint pass.
- One unexplained `SyntaxError: Unexpected end of JSON input` appeared in the dev-server log on one of three E2E runs.
  None of our routes produce it (they all catch bad JSON), and it didn't reproduce. Likely dev-server recompilation;
  left open.

**Not verified:** narrow and mobile layouts, and a screen-reader pass.

## Human correction / what we learned
Screenshots in the loop caught a bug that typecheck and the green test missed: the thumbnails "worked" but never
appeared. The fix was to turn "looks right" into a test assertion.
