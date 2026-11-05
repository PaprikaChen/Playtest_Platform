# Handoff: shift 2 (Paprika) → next shift

*Updated 2026-11-05 by Paprika with Claude Code. Regenerate with the `shift-handoff` skill at the end of each shift.*

## State in one paragraph
Everything is merged on `main` (no open PRs, no unpushed commits). On top of shift 1's alpha:
- **The first real human playtest happened** (#15, Chinese speech, real mic, two sessions): transcription and timestamps
  held up, and it caught a real bug — replay seeks past ~16 s failed with `PIPELINE_ERROR_DECODE`. Fixed in PR #36:
  recordings are now remuxed losslessly with ffmpeg (clusters re-cut at keyframes); `makeSeekable` is only the fallback.
- **AI summaries shipped** (PR #38 + #39, decision 0005): each recall card also carries a first-person "One way to put
  it" rewording of the tester's comment (same language, intensity preserved, never strengthened or softened). Testers
  insert it with an explicit button; developers see "AI summary" per reminder, "Used quote" / "Used AI wording" per
  card, and an "Includes AI wording" label under answers containing AI text.
- **A real provider is wired up**: `ANTHROPIC_API_KEY` in `.env.local` (Paprika's key, claude-haiku-5-5). Verified
  against the real Chinese sessions: matching works across languages (the keyword mock extracts zero tokens from
  Chinese — Chinese testers *require* a real provider), summaries are faithful and keep intensity.
- Verified by 38 unit tests + 11 Playwright tests, which now also run on Windows (CI and both dev machines).

## Run it
```bash
npm install
npm run dev     # http://localhost:3000
npm run check   # lint + typecheck + unit tests (pre-push hook runs this)
npm run e2e     # pinned to the keyword mock — your .env.local key is deliberately NOT used (see gotchas)
```
Recall uses the real model only with a key in `.env.local` (`ANTHROPIC_API_KEY=` / `RECALL_PROVIDER=anthropic`); ask
Paprika for hers or create your own. Without a key the keyword placeholder runs — fine for English, empty for Chinese.

## Open items, in order
1. **#15 — record the demo video** (the real playtest is done; the video is not). Best flow to show: upload →
   play + talk → recall cards with "One way to put it" → insert → developer review with the AI-wording labels.
2. **Alpha report** (`docs/Alpha_Release_Task_Backlog.docx`, due Nov 5): check the layout by actually opening it, add
   the demo video link and a board screenshot, rewrite the AI reflection in our own words. Fresh material in ai-log
   015–017: the human playtest caught what 7 green E2E runs missed; a real key silently leaked into E2E; two human
   corrections shaped the summary feature (first person; intensity rule + provenance).
3. **Board**: make it public before submitting and add Paprika as editor (both on Amilia's account). Move #35/#37
   cards to Done (labels already flipped).
4. **#16 — choose the recall LLM** with a labeled set. New graded dimensions from this shift: summary faithfulness,
   intensity preservation, no added sentiment. Only claude-haiku-5-5 is verified so far.
5. **#17–#20** as before (real-key transcription; auth; Supabase; isolated origin), then #23/#24/#25 (in progress).

## Not verified / known risks
- Real-model behaviour is verified **only for claude-haiku-5-5**; whether Gemini/OpenAI obey the summary rules is #16.
- The summary insert buttons have no automated browser test: E2E runs the mock, which produces no summaries.
- OpenAI / AssemblyAI transcription paths: still no key (#17).
- Whisper with noise, accents, bad mics: the real test was one quiet room. Mandarin transcripts still mix
  Traditional/Simplified; summaries follow the comment's script.
- Accessibility (screen reader) and phone-width play layout: untested.
- The report .docx layout has still never been opened and checked.

## Decisions pending a human
- **Board public + access** (Amilia): see open item 3.
- **LLM provider** (#16) — after the eval; Haiku is a stopgap default, not a decision.
- Whether merged remote branches (`fix/31-…`, `feat/37-…`, `fix/38-…`) get deleted (cleanup only).

## Gotchas (new this shift; the rest in CLAUDE.md)
- **Next.js loads `.env.local` into anything it starts** — the E2E server too. Playwright pins `RECALL_PROVIDER=mock`
  so tests stay deterministic and free; don't remove that pin.
- `makeSeekable` (ts-ebml) cues can point at clusters Chrome can't decode from — that's why ffmpeg remux is primary.
  The webm unit test asserts the keyframe-cluster invariant; keep it.
- Deleting a merged PR's base branch **closes** stacked PRs on GitHub instead of retargeting them (hit this with #38 —
  reopened and retargeted by hand). Merge stacked PRs bottom-up and retarget children before deleting branches.
- Recall `max_tokens` is 16000: summaries grow output with match count; 2000 truncated an 11-match session mid-JSON.

## How we track work
- GitHub issue labels (`status:`, `priority:`, `area:`) are the source of truth. The board's Status / Priority / Area
  fields mirror them: when you change a label, also move the card.
- Every AI-assisted change gets a `docs/ai-log/` entry. `npm run ai-log:stats` gives the numbers for the report.
