---
id: 015
date: 2026-11-05
issue: 35
agent: claude-code
model: claude-fable-5
type: bugfix
commits: [b153681, 4bca66e]
outcome: accepted
human_corrections: 0
caught_by: [human-playtest]
---
## Requirement
Recall-card replay must seek to any moment of the recording. In the first real human playtest (Chinese speech, real mic,
69 s and 155 s sessions), every replay after ~16 s showed "Recording unavailable".

## Prompt
Human: "为什么现在点击prompt对应的视频显示recording not available" after completing the first real playtest (#15).

## What the AI did
- Reproduced in the browser: seeks before 16.05 s play, later ones fail with `MediaError code 3,
  PIPELINE_ERROR_DECODE`; continuous playback of the same file is fine, so the data was intact.
- Parsed the WebM: video keyframes exist every ~7 s, but MediaRecorder's clusters start with audio blocks or video
  delta frames. `makeSeekable` (ts-ebml) builds a CuePoint per cluster, so most cues point at positions Chrome cannot
  start decoding from. Seeks that happened to land in a keyframe-led cluster (e.g. 14.76 s) worked, which is why the
  E2E replay at second 8 never caught it.
- Verified the fix hypothesis before coding: `ffmpeg -c copy` remux of the broken recording made every seek
  (0–68 s) land exactly.
- Implemented `remuxSeekable()` (lossless ffmpeg remux; clusters re-cut at keyframes, Cues/Duration rebuilt) as the
  primary path in `assembleRecording`, keeping `makeSeekable` as a fallback when ffmpeg fails. `assembleRecording`
  and `finalizeStaleSessions` became async.
- Test first: `tests/webm.test.ts` now parses the remuxed fixture and asserts every cluster's first video block is a
  keyframe (SimpleBlock flag, or BlockGroup without ReferenceBlock — ffmpeg writes BlockGroups), plus temp-file
  cleanup and invalid-input rejection.
- Also made `playwright.config.ts` pass the webServer env via `env` instead of a `VAR=x` command prefix, which does
  not run on Windows (shift 2 develops on Windows; the E2E suite could not start at all).

## Validation
- `npm run check`: 34/34 unit tests pass.
- `npm run e2e` on Windows in real Chrome: all pass (first run of the suite on Windows).
- Browser check against the real broken recording: all seek targets 0–68 s play after remux; both existing playtest
  sessions were remuxed in place and their recall-card replays work.

## Human correction / what we learned
The E2E replay test seeks to second 8, inside the first keyframe cluster, so it could never catch this. Synthetic
captures also keyframe more often than a mostly-static real screen share. Lesson: seekability must be asserted
structurally (cues → keyframe-led clusters), not just by one early-timestamp replay; and the first real-human playtest
(#15) immediately found what 7 green E2E runs missed.
