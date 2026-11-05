# CLAUDE.md: agent handbook for Playtest Platform

Context for AI coding agents (Claude Code, Codex, etc.) working in this repo. Humans: start with README.md.

## Product in one paragraph
Indie developers upload a web-game ZIP, write a questionnaire and share one invite link. Testers play in the browser while
screen + mic are recorded on one timeline and they type comments. After playing, each question shows **recall cards**
(tester's own words + timestamp + neutral hint + 10 s replay). **Nothing is filled in automatically.** Developers review
video, timeline and answers. Source of truth: `project_proposal.pdf`, `playtest_feedback_technical_spec (3).pdf`.

## Commands
```bash
npm run dev         # http://localhost:3000
npm test            # vitest (must pass before any commit)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # production build (CI runs this)
npm run e2e         # Playwright, real Chrome, fake screen + mic (e2e/fixtures/speech.wav); writes docs/screenshots/e2e-*.png
```
Node ≥ 22.5 (built-in `node:sqlite`). Data goes in `./data` (git-ignored). Sample build: `samples/lantern-hop.zip`.

## Map
- `src/lib/db.ts`: SQLite schema. It mirrors the planned Supabase tables, so keep the two in sync (see `docs/decisions/0001`).
- `src/lib/repo.ts`: all data access and **all access checks** (`requireTesterSession`, invite scoping, retention purge).
- `src/lib/processing.ts`: async pipeline: chunks → recording → transcript → recall prompts.
- `src/lib/ai/`: provider adapters. `recall.ts` makes **one call per session**; output is sanitised against real IDs.
- `src/app/api/**`: route handlers wrapped in `route()` from `src/lib/http.ts` (JSON errors via `HttpError`).
- `src/app/t/[token]/`: tester flow. `src/app/projects/[id]/` and `src/app/sessions/[id]/`: creator flow.
- `tests/`: vitest. `tests/fixtures/`: small binary fixtures (real MediaRecorder WebM).

## Invariants (do not break; each has a test or should get one)
1. **Testers' words are never rewritten.** Quotes shown anywhere come from the `utterances` table, never from model output.
   LLM output may only reference `question_id` / `utterance_id`; `sanitizeMatches` drops anything else.
2. **Hints are neutral.** No sentiment the tester didn't express, and no suggested answers.
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
- A MediaRecorder keeps recording when one track ends. Don't stop it when screen sharing ends, or the mic is lost.

## Workflow (every change)
1. Work from a GitHub issue with **acceptance criteria** (use the issue template). Branch: `feat/<issue#>-slug`, `fix/…`, `chore/…`.
2. Write a short plan in the issue or PR before coding. For behaviour changes, **write the failing test first**.
3. Implement, then verify: `npm test && npm run typecheck && npm run lint`. For UI, run the app and check it in a browser,
   and attach a screenshot to the PR.
4. **Log the AI task** in `docs/ai-log/` with the `/log-ai-task` skill (required: the Stop hook blocks until the latest
   agent commit is logged).
5. Open a PR with the template, `Closes #<issue>`. CI must pass; a teammate reviews before merge.

## Style
TypeScript strict. Small server-side modules in `src/lib`, no ORM. Tailwind with the tokens in `globals.css`
(`bg-surface`, `text-muted`, `border-line`, `accent`…). Prefer editing existing components over adding new libraries.
