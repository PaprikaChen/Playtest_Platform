---
id: 005
date: 2026-11-04
issue: 13
agent: claude-code
model: claude-opus-5-5
type: bugfix
commits: [2bf7a65]
outcome: accepted
human_corrections: 0
caught_by: [browser-test]
---
## Requirement
Replay clips must seek to arbitrary timestamps. MediaRecorder WebM files have no duration or cue index, so browsers seek
unreliably.

## Prompt
Follow-up to the human's "±5 s clip" request (entry 001).

## What the AI did
- Added `makeSeekable()` using `ts-ebml` to rewrite the header with duration + cues.
- In the browser test the recording **failed to load (MediaError)**. Hex-dumping the file showed it began with
  `{"chunkCount":11,...}`, which is the JSON body of an unrelated HTTP request.
- Root cause: `ts-ebml`'s encoder returns `Buffer.concat(...).buffer`. For a small header, that is Node's shared 8 KB
  buffer pool, holding other requests' bytes.
- Fix: set `Buffer.poolSize = 0` during the call, add a duration fallback from the client clock, and assert the EBML
  magic number on the output.
- A first fixture taken from the corrupted file was itself unusable. The agent recorded a fresh 2 s WebM in the browser
  as the fixture.

## Validation
- Regression test: `tests/webm.test.ts` (pollutes the pool first, then asserts a clean header).
- In the browser: `duration = 20.18 s`, and seeking to 9.1 s lands exactly.

## Human correction / what we learned
The bug was silent: no exception was thrown and the file was written successfully. It surfaced only because the agent
re-loaded the result in a real `<video>` element. Lesson: validate the *artifact*, not just the function's return value.
