# CLAUDE.md: agent handbook for Playtest Platform

Context for AI coding agents (Claude Code, Codex, etc.) working in this repo. Humans: start with README.md.

## Product in one paragraph
Indie developers upload a web-game ZIP, write a questionnaire and share one invite link. Testers play in the browser while
screen + mic are recorded on one timeline and they type comments. After playing, each question shows **recall cards**
(tester's own words + timestamp + neutral hint + 10 s replay, plus an AI first-person rewording when a real model runs,
decision 0005). **Nothing is filled in automatically.** Developers review
video, timeline and answers. Source of truth: `project_proposal.pdf`, `playtest_feedback_technical_spec (3).pdf`.

## Commands
```bash
npm run dev         # http://localhost:3000
npm run check       # lint + typecheck + unit tests (the pre-push hook runs this)
npm test            # vitest, incl. a real Whisper accuracy test (SKIP_ASR=1 to skip)
npm run typecheck   # tsc on sources only (tsconfig.typecheck.json; ignores generated .next*/types)
npm run lint        # eslint
npm run build       # production build (CI runs this)
npm run e2e         # Playwright, real Chrome, fake screen + mic (e2e/fixtures/speech.wav); writes docs/screenshots/e2e-*.png
```
Node ≥ 22.5 (built-in `node:sqlite`). Data goes in `./data` (git-ignored). Sample build: `samples/lantern-hop.zip`.

## Map
- `src/lib/db.ts`: SQLite schema. It mirrors the planned Supabase tables, so keep the two in sync (see `docs/decisions/0001`).
- `src/lib/repo.ts`: all data access and **all access checks** (`requireTesterSession`, invite scoping, retention purge).
- `src/lib/processing.ts`: async pipeline: chunks → recording → transcript → recall prompts.
- `src/lib/ai/`: provider adapters. `transcribe.ts` produces word timestamps → `groupWords` segments (local Whisper default). `recall.ts` makes **one call per session**; output is sanitised against real IDs.
- `src/app/api/**`: route handlers wrapped in `route()` from `src/lib/http.ts` (JSON errors via `HttpError`).
- `src/app/t/[token]/`: tester flow. `src/app/projects/[id]/` and `src/app/sessions/[id]/`: creator flow.
- `tests/`: vitest. `tests/fixtures/`: small binary fixtures (real MediaRecorder WebM).

## Invariants (do not break; each has a test or should get one)
1. **Testers' words are never rewritten.** Quotes shown anywhere come from the `utterances` table, never from model output.
   LLM output may only reference `question_id` / `utterance_id`; `sanitizeMatches` drops anything else.
2. **Hints are neutral; summaries only restate the tester.** Hints carry no sentiment the tester didn't express and no
   suggested answers. An AI summary (decision 0005) is a first-person rewording of the tester's own meaning and voiced
   suggestions, nothing beyond them (never stronger or softer); it is labeled ("AI summary" for developers, "One way to
   put it" for testers), inserting it is an explicit tester action, and the review marks answers that include it
   (`inserted_as`).
3. **The questionnaire never blocks on AI.** Pending or failed transcription/prompts must leave submission working.
4. **Tester endpoints require the invite token** (`x-invite-token` header or `?t=` for media), and sessions are bound to their invite.
5. **Build files are static only.** Never execute uploaded code server-side. Games run in a sandboxed iframe **without** `allow-same-origin`.
6. **ZIP validation** rejects traversal (check `unsafeOriginalName`; JSZip silently normalises `../`), > 2000 files, > 200 MB, and no `index.html`.
7. **Retention:** sessions are deleted 7 days after creation (`purgeExpired`), or immediately on request.
8. **Replay window** = utterance start − 5 s → utterance end + 5 s (`REPLAY_BEFORE_MS` / `REPLAY_AFTER_MS`).

## Known gotchas (learned the hard way; see docs/ai-log)
- `node:sqlite` rows have a null prototype, so `db.ts` copies them before they reach React client components.
- Tailwind v4: a custom class cannot `@apply` another custom class.
- Anything using `window` / browser APIs in a client component must read it in `useEffect`, or hydration fails.
- `ts-ebml` returns pooled `ArrayBuffer`s; `webm.ts` disables `Buffer.poolSize` around the call.
- The Claude desktop in-app browser blocks iframes and cannot use the screen-share picker. Use `npm run e2e` (real Chrome).
- Chrome's Web Speech API does **not** hear `--use-file-for-fake-audio-capture` (always `no-speech`), so live captions
  can't be tested automatically. The recording's audio track can be, and the E2E checks it.
- Local Whisper needs the `_timestamped` ONNX export for word timestamps. Plain exports only give coarse ~7 s segments.
- Whisper outputs Traditional Chinese for Mandarin; tests accept both scripts.
- A MediaRecorder keeps recording when one track ends. Don't stop it when screen sharing ends, or the mic is lost.
- Next.js strips `Content-Encoding` set by a route handler, so `.br`/`.gz` game assets are decompressed server-side.
- The HTML `hidden` attribute loses to Tailwind display classes (`flex`, `grid`). Toggle classes instead.
- `src/components/ui.tsx` and `src/lib/format.ts` are imported by client components. Never import `repo`/`db` there
  (server-only UI lives in `src/components/shell.tsx`).
- **Agents can't type into interactive prompts** (the Claude terminal panel doesn't take agent keystrokes). Use
  non-interactive flags, or run in the background and hand the human the code/URL (e.g. `gh auth refresh` device code).
- Run eslint via `npm run lint` (whole repo, with ignores), not on hand-picked folders: a config gap once hid 1000+
  local errors that CI didn't see.

## Workflow (every change)
1. **Start from an issue** with acceptance criteria (issue template), and move it to *In Progress* on the board.
   Branch: `feat/<issue#>-slug`, `fix/…`, `chore/…`.
2. **Design review before code.** For anything user-facing, propose the design (and ask open questions) before
   implementing. For behaviour changes, **write the failing test first**.
3. **Implement, then verify locally:** `npm run check`, plus `npm run e2e` for anything touching the tester or creator
   flow. Look at the screenshots it writes, not only the pass/fail.
   **A flaky test is a bug until proven otherwise:** run it 3× and find the cause. Twice, "flakes" here were real
   races (a stale "Draft saved" label; the page switching tabs after a refresh). Never add retries to hide them.
4. **Log the AI task** in `docs/ai-log/` with the `log-ai-task` skill, listing every commit. The Stop hook blocks until
   all agent commits on the branch are logged.
5. **Push only after the human says so.** The pre-push hook runs `npm run check`. Then open or update the PR
   (template, `Closes #…`). CI runs check and E2E; a teammate reviews before merge.
6. **Batch GitHub-visible changes** (push, PR edits, issue/board updates) at the end of a task, after the human has seen
   the result locally. Making anything public (repo, board) is always the human's call.
7. **End of shift:** run the `shift-handoff` skill to update `docs/HANDOFF.md` for the next person.

## UI checklist (before showing a screen)
- Every region has a title and a few-word tag saying what it's for (`Panel` component). Name the game, build and
  status in plain words.
- Check E2E screenshots at 1440 px and 375 px (no horizontal scroll; long names wrap or truncate).
- Avoid the generated-design tells listed in Anthropic's frontend-design skill: cream backgrounds, ALL-CAPS eyebrow
  labels, `A · B · C` metadata, monospace data labels, `→` in buttons, identical cards everywhere.
- Accent `#3575D4` keeps white button text at WCAG AA (4.5:1). Don't go lighter for buttons; use `accent-light` for
  decoration.

## Edge-case checklist (before calling a feature done)
Empty, huge and Unicode input · malformed JSON · wrong or turned-off token · double click and double submit · reload
mid-flow · tester leaves mid-session · permission denied (screen/mic) · network failure and retry · file names with
spaces, `%`, `..` or CJK · phone width.

## Style
TypeScript strict. Small server-side modules in `src/lib`, no ORM. Tailwind with the tokens in `globals.css`
(`bg-surface`, `text-muted`, `border-line`, `accent`…). Prefer editing existing components over adding new libraries.
