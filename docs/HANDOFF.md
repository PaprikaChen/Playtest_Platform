# Handoff: shift 1 (Amilia) → shift 2 (Paprika)

*Updated 2026-11-05 by Amilia with Claude Code. Regenerate with the `shift-handoff` skill at the end of each shift.*

## State in one paragraph
The alpha runs the whole loop locally:
- game → ZIP upload → questions → invite link
- tester plays with screen + mic, and notes
- the recording is transcribed with **word timestamps (local Whisper, free)**
- questionnaire with **recall cards** (the tester's own words, a neutral hint, a 10 s replay)
- developer review with a moment timeline

All of it is on branch `alpha-release`, in **PR #30 (open, CI green)**. It's verified with 31 unit tests and 7
Playwright tests in real Chrome that use a fake screen and a fake mic playing synthesized speech. **No real human has
played it with a real mic yet** (#15).

## Run it
```bash
npm install
npm run dev     # http://localhost:3000 (first transcription downloads an ~80 MB model into .models/)
npm run check   # lint + typecheck + unit tests (also runs automatically before every git push)
npm run e2e     # full browser flow, writes screenshots to docs/screenshots/e2e-*.png
```
Read `CLAUDE.md` first: map, invariants, gotchas, and the workflow every change follows.

## Open items, in order
1. **Review and merge PR #30** into `main`. Focus on `src/lib/repo.ts` (access checks), `src/lib/ai/` and
   `src/app/t/[token]/`.
2. **#15 Real playtest in Chrome:** play the sample game with a real mic, check that transcript timing feels right,
   record the demo video. This is the biggest unverified risk.
3. **#16 Choose the recall LLM:** build ~30 labeled comment → question pairs; compare Gemini, GPT and Claude Haiku
   against the keyword placeholder on accuracy, neutrality and tokens per session. Recall currently uses keyword
   matching (labeled "placeholder" in the UI).
4. **#18 / #19 Auth + Supabase:** there's no login today (local creator mode). See decision 0001.
5. **#20 Isolated origin for game files** (decision 0003), and **#23 / #24 / #25** (in progress; each issue has a comment
   saying what's left).

## Not verified / known risks
- Real-mic, noisy or accented speech. The accuracy test uses clean synthesized audio.
- OpenAI / AssemblyAI transcription paths: no API keys yet.
- The E2E job in CI is new. Its first run will tell us whether Chromium on Linux handles the fake media flags.
- Local Whisper is too heavy for serverless hosting. A deploy needs `TRANSCRIBE_PROVIDER=openai|assemblyai` or a worker.
- Mandarin transcripts come out in Traditional characters.
- A one-off dev-server error (`__webpack_require__.C is not a function`) appeared once and didn't recur.

## Decisions pending a human
- **Make the board public?** It's private at https://github.com/users/amilialiu25/projects/1. The plan is to make it
  public right before submitting, so graders can open the link. Add Paprika under ⋯ → Settings → Manage access to let
  her edit it. The repo itself is already public.
- **Which LLM provider** (#16), after the eval.
- **Report:** `docs/Alpha_Release_Task_Backlog.docx`. It needs the demo video link, a board screenshot, and edits to the
  AI reflection in your own words.

## How we track work
- GitHub issue labels (`status:`, `priority:`, `area:`) are the source of truth. The board's Status / Priority / Area
  fields mirror them: when you change a label, also move the card.
- Every AI-assisted change gets a `docs/ai-log/` entry. `npm run ai-log:stats` gives the numbers for the report.
