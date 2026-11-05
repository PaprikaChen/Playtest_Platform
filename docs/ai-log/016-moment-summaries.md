---
id: 016
date: 2026-11-05
issue: 37
agent: claude-code
model: claude-fable-5
type: feature
commits: [8def474, 8be902f]
outcome: accepted
human_corrections: 1
caught_by: [browser-test]
---
## Requirement
For each extracted moment, the AI also writes a short summary of what the tester's clip expresses — the observation and
any suggestion the tester themselves voiced. Paprika decided it shows on **both** surfaces (tester recall cards and the
developer review).

## Prompt
Human: "下一个版本我想不光是用ai去提取和理解片段，并且对于每个提取出来的片段，我们都直接用ai去辅助地总结这个片段录音
表达的意思和建议" and, offered the tester-vs-developer design choice, "两边都要".

## What the AI did
- Flagged the invariant tension first: a summary shown to testers lives close to "no suggested answers", so the human
  made the surface call explicitly; the refinement is decision 0005 and CLAUDE.md invariant 2 was reworded.
- Same single call per session (decision 0002): each match now also returns `summary`, grounded only in the tester's
  comments, written in the comment's language. `sanitizeMatches` normalises whitespace and caps it at 400 chars.
- `recall_prompts.summary` column (additive migration), stored in processing, returned by the existing API.
- Tester card: "AI summary" labeled block under the quote; separate explicit "Add summary" button inserts editable text
  (quote button renamed "Add quote" when a summary exists). Banner wording updated.
- Developer review: summary line under each reminder, same label.
- Keyword placeholder produces no summaries (echoing the quote adds noise); both UIs render cleanly without one.
- Tests first: sanitisation (kept/normalised/capped/coerced), mock produces none, prompt asks for grounded
  same-language summaries. The old exact-equality assertion failed as expected until the field existed.

## Validation
- `npm run check`: 37/37 unit tests.
- `npm run e2e`: the first run FAILED 2 tests — Next loads `.env.local` on its own, so the developer's real Anthropic
  key leaked into the E2E server: the real model generated summaries, the card button renamed to "Add quote", and the
  "Add to my answer" locators timed out (the suite was also silently spending tokens). Fixed by pinning
  `RECALL_PROVIDER=mock` in the Playwright webServer env; full suite green after that, with cards rendering cleanly
  without summaries. The summary interaction itself needs a real key and was verified by hand.
- Browser check with Claude Haiku against the real Chinese playtest session: summaries are faithful, neutral and in
  Chinese; "Add summary" inserts editable text and marks the card Used; developer review shows labeled summaries;
  schema migration applied on server restart.

## Human correction / what we learned
Paprika corrected the tester-facing framing after trying it: third-person "AI summary" ("测试者认为…") read like a
verdict about the tester; she asked for first person as "a possible way to put it". The prompt now asks for the
tester's first person, the card label is "One way to put it" (AI provenance in the banner and tooltip), the insert
button is "Use this wording", and decision 0005 records the reasoning. The developer review keeps the "AI summary"
label — first-person content reads there as the tester's own voice.
Surface placement was a product decision, not a technical one — the agent proposed developer-only as the safe default
and the human chose both, which forced the invariant refinement to be written down (decision 0005) instead of silently
drifting. Summary quality/steering now needs explicit grading in the #16 eval and watching in the #26 pilot.
Second lesson: adding the first real API key changed what the E2E suite tested without anyone touching the suite —
environment that a framework loads implicitly (`.env.local`) must be pinned in test configs, not inherited.
Third catch (second real-data run): summaries made the model's output grow with match count, and the hardcoded
`max_tokens: 2000` truncated an 11-match Chinese session mid-JSON — the prompts stage failed cleanly (invariant 3 held:
the questionnaire still worked). Raised to 16000. Output budgets must scale with what the prompt now asks for.
