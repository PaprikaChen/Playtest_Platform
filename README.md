# Playtest Platform

Private browser playtests with timestamped feedback. CS146S Aut26 final project, by Paprika Chen & Amilia Liu.

A developer uploads a web-game ZIP, writes a questionnaire and shares one invite link. Testers play in the browser while their screen and mic are recorded on one timeline, and they can type comments as they go. When they finish, every questionnaire question shows **recall cards**: the tester's own words, the timestamp, a neutral prompt, and a 10-second replay of that moment (5 s before → 5 s after). Nothing is filled in automatically. The developer reviews sessions with a clickable timeline, the answers, and which recall cards were used.

See `project_proposal.pdf` and `playtest_feedback_technical_spec (3).pdf` for the full design.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest: ZIP validation, zip-bomb cap, recall sanitising, WebM fix, full flow
npm run e2e          # Playwright in real Chrome with a fake screen + a fake mic playing synthesized speech
npm run typecheck && npm run lint
```

Requires Node 22.5+ (uses the built-in `node:sqlite`). Data lives in `./data` (git-ignored).

Try it with the sample build: create a project, upload `samples/lantern-hop.zip`, save the default questionnaire, click **Create link**, then open the link in **Chrome** and pick "this tab" when asked to share your screen.

## How we work with AI agents

Every change follows: **issue with acceptance criteria → plan → test first → implement → browser check → AI log entry → PR → CI + review**.

- [`CLAUDE.md`](CLAUDE.md): agent handbook covering the map, invariants, gotchas and workflow.
- [`docs/decisions/`](docs/decisions): short records of key design decisions.
- [`docs/ai-log/`](docs/ai-log): one entry per AI task (requirement, prompt, change, validation, human correction). A
  Claude Code Stop hook blocks ending a session with an unlogged agent commit. `npm run ai-log:stats` summarizes the log.
- `.github/`: issue template (acceptance criteria), PR template, CI (lint · typecheck · tests · build · AI-log
  summary), and an optional Claude PR review (enabled by an `ANTHROPIC_API_KEY` secret).

## AI providers (optional)

Copy `.env.example` to `.env.local`. Without any key the app runs fully with placeholders:

| Stage | Default without keys | With a key |
|---|---|---|
| Speech → text | Live browser captions (Chrome Web Speech API) during play | `ASSEMBLYAI_API_KEY`: full post-session transcript replaces live captions |
| Comment → question matching | Keyword/synonym matcher (marked "placeholder" in UI) | `RECALL_PROVIDER=gemini\|openai\|anthropic` plus that provider's key; `RECALL_MODEL` overrides the model |

Recall uses **one LLM call per session** (all questions and all comments in one compact prompt, JSON out) to keep token use low. Model output may only reference comment IDs; quotes shown to testers always come from the stored comment, so the model can't rewrite what someone said.

## Architecture (alpha)

```
src/app/                      Next.js App Router (pages + route handlers)
  page.tsx                    creator dashboard
  projects/[id]/              upload build · questionnaire editor · invite links · sessions
  sessions/[id]/              developer review (video, timeline, answers, export/delete)
  t/[token]/                  tester: consent → play + record → questionnaire
  g/[token]/[...path]         serves extracted build files (invite-gated, static only)
  api/…                       JSON API matching the tech spec
src/lib/
  db.ts                       SQLite schema (mirrors planned Supabase tables)
  zip.ts                      ZIP validation (paths, count, size, index.html)
  repo.ts                     data access + access checks + 7-day purge
  processing.ts               chunk assembly → transcript → recall prompts (async)
  webm.ts                     adds duration/cues so recordings are seekable
  ai/transcribe.ts, recall.ts provider adapters + mock
```

**Security notes:** games run in a sandboxed iframe *without* `allow-same-origin` (opaque origin, so they can't call platform APIs). Tester API calls need the invite token, and each session is bound to its invite. Build files are never executed server-side. Sessions auto-delete after 7 days (lazy purge on read) or immediately from the review page.

**Alpha limitations:** there is no creator login (single local creator); storage is local SQLite/files rather than Supabase; game builds are served from the same origin as the app instead of an isolated one; and Godot 4 threaded builds (which need COOP/COEP headers) aren't supported yet. See the GitHub Issues backlog.
