---
id: 019
date: 2026-11-05
issue: 40
agent: claude-code
model: claude-fable-5
type: feature
commits: [9853b97]
outcome: accepted
human_corrections: 0
caught_by: [human-playtest]
---
## Requirement
The session language must be what the tester actually speaks, chosen by them — not the browser UI locale.

## Prompt
Human (while recording the demo video): "我刚刚说的明明是英文，但是在转写和建议的过程中，却出现了中文…可以在开头去加个功能是
让 playtester 自己去选择，我即将说什么语言，然后我们后面就统一的只听并且展出他写的这个语言。"

## What the AI did
- Root cause: `createSession` stored `navigator.language` — a zh-CN browser forced Whisper into Chinese while the
  tester spoke English, and the summaries followed.
- `SPOKEN_LANGUAGES` in `src/lib/types.ts` (code / label / Whisper name) now feeds three places: the consent-page
  picker (defaulting from the browser locale, tester can change it), Whisper's language hint, and the recall prompt,
  which now says "write every hint and summary in <language>" instead of "same language as the comment". Live captions
  use the choice too.
- Tests first: the recall prompt names the declared language ("en" → "in english", "zh-CN" normalises to chinese,
  unknown falls back to comment language).

## Validation
- `npm run check`: 39/39.
- `npm run e2e`: full suite (picker defaults to English under Playwright's en-US locale, so flows are unchanged);
  consent screenshot inspected for the new field.
- Real-model check: English speech with the picker on a zh-CN browser produces an English transcript, hints and
  summaries (the demo-video recording run).

## Human correction / what we learned
Inferring intent from environment (browser locale) instead of asking the user broke the first non-matching case.
The tester's language is an input, not a guess; the fix also made hints follow the declared language, which was
previously unspecified.
