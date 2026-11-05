---
id: 002
date: 2026-11-04
issue: null
agent: claude-code
model: claude-opus-5-5
type: feature
commits: [2bf7a65]
outcome: accepted-with-fixes
human_corrections: 0
caught_by: [unit-test, browser-test, type-check]
---
## Requirement
Core loop per spec: project → ZIP upload → questionnaire → invite → tester capture + comments → recall questionnaire →
developer review → export/delete/7-day retention. No API keys available, so AI stages need placeholders.

## Prompt (faithful summary)
The design answers from 001 + "core loop, wire real AI if keys exist otherwise placeholders; local storage first;
GitHub Issues backlog."

## What the AI did
- Scaffolded Next.js 15 + TS + Tailwind v4.
- Wrote the SQLite schema, repo layer, 14 API route handlers matching the spec's API table, the tester capture flow
  (MediaRecorder, chunked uploader, live captions), recall cards with a clip player, and the review page.
- Added provider adapters (AssemblyAI, Gemini, OpenAI, Anthropic) and a keyword mock.
- Wrote a sample game (`samples/lantern-hop.zip`) with a deliberately hard jump so there is something to comment on.

## Validation
- 16 vitest tests.
- Full flow driven in the in-app browser: created a project, uploaded via the real file input, saved the questionnaire,
  created an invite, and ran a recorded session from a synthetic canvas stream through the real API.
- Checked recall cards, insert/dismiss, clip replay, submit, timeline seek, export ZIP contents, and a 403 on a wrong token.

## Human correction / what we learned
None in code. All defects were found by the agent's own verification and are logged as 003–006. **Not verified:** real
`getDisplayMedia` screen capture, because the in-app browser cannot drive the picker. Tracked as #15.
