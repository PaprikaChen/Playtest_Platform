---
id: 013
date: 2026-11-05
issue: null
agent: claude-code
model: claude-opus-5-5
type: bugfix
commits: [240f6a3]
outcome: accepted-with-fixes
human_corrections: 1
caught_by: [browser-test, unit-test, review]
---
## Requirement
Make the blue slightly lighter and less saturated (a small change), research whether the left/right layout should
change, and test more edge cases.

## Prompt (faithful summary, translated from Chinese)
"Can the blue look better? A bit lighter or less saturated, but not too different; it's already good. Research
whether the layout (still left/right) should change. Test more edge cases for other bugs."

## What the AI did
- Computed WCAG contrast for candidate blues and picked the lightest button colour that keeps white text at AA
  (`#3575D4`, 4.52:1). Decorative fills use a lighter `#4A87DF`.
- Researched navigation and session-review patterns. Changed the game page from two columns to three tabs; made the
  review timeline sticky; made the play-screen notes panel collapsible.
- New edge-case tests:
  - range parsing
  - questionnaire version pinning
  - the 30-question limit
  - rating clamps
  - nested ZIP with Unicode filenames and `.br` assets
  - long names at phone width
  - panel toggle

## Bugs found and fixed
1. **Pre-compressed `.br`/`.gz` game files reached the browser still compressed.** Next.js strips a route handler's
   `Content-Encoding` header, which would break Unity/Godot builds. They are now decompressed on the server.
2. **Range requests:** a suffix range (`bytes=-500`) was served from byte 0, and an inverted range (`bytes=100-50`) could
   crash the stream. A new `parseRange` returns proper 206/416 responses, with unit tests.
3. **Long game names overflowed on phones:** 137 px on the home page and 42 px from the header switcher. Now wrapped or
   truncated.
4. While building the panel toggle, the agent noticed that the `hidden` attribute is overridden by Tailwind's `flex`
   class, so the panel would never hide. Switched to conditional classes; E2E checks it.

## Validation
31 unit tests and 7 E2E tests pass (real Chrome), along with lint, typecheck and the production build.

**Not verified:** a dev-server `TypeError: __webpack_require__.C is not a function` appeared once during an E2E run and
didn't recur (dev hot-reload artifact; the production build is clean).

## Human correction / what we learned
"Lighter" and "accessible" pull in opposite directions for white-on-blue buttons. Quantifying it (contrast ratios) made
it a small, explainable trade-off instead of a guess.
