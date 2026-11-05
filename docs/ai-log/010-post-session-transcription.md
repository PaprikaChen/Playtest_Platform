---
id: 010
date: 2026-11-05
issue: 17
agent: claude-code
model: claude-opus-5-5
type: feature
commits: [b437a40]
outcome: accepted
human_corrections: 0
caught_by: [unit-test, browser-test]
---
## Requirement
Voice input must actually reach recall cards, with replay within 1 s, and be verifiable. The human chose the
"post-session API" approach over browser live captions.

## Prompt
"Post-session API" (choosing option 1 from entry 009).

## What the AI did
- With no API key available, the agent proposed and built a **free local Whisper** default (transformers.js +
  `ffmpeg-static`), alongside OpenAI and AssemblyAI adapters behind one interface. See decision 0004.
- Prototyped first. Plain Whisper exports only give coarse segments (0–7 s); the `_timestamped` export gives word times
  (2.98 s vs a true 3.0 s). Mandarin also works, but outputs Traditional characters.
- Added word → sentence grouping, a `sessions.language` column with an additive migration, and the browser language passed
  through. Live captions are now off by default (privacy; redundant).

## Validation
- `tests/transcribe.test.ts`: ground-truth speech onsets come from signal energy. Every English phrase starts within
  1 s, and the Mandarin start is within 1 s. 23 unit tests pass.
- E2E in real Chrome: three spoken sentences → three transcript entries (0:02, 0:10, 0:17) → five recall cards under the
  matching questions.
- The production build passes.

**Not verified:** OpenAI and AssemblyAI paths (no keys), noisy real-mic audio, and accented speech.

## Human correction / what we learned
Before building, check that the API does what you assume: the default model export silently lacked word timestamps.
Measuring against ground truth taken from the signal, instead of against the model's own output, is what makes the
"within 1 s" claim checkable.
