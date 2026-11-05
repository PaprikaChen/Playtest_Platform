---
id: 001
date: 2026-11-04
issue: null
agent: claude-code
model: claude-opus-5-5
type: design
commits: []
outcome: accepted-with-fixes
human_corrections: 2
caught_by: [human]
---
## Requirement
Turn the proposal + technical spec into an alpha that can be demoed within ~24 hours, and settle the open design questions.

## Prompt (faithful summary, translated from Chinese)
"I need to do the CS146 final project; this is tomorrow's submission requirement [assignment PDF]. Here is our GitHub
repo; it has enough info. Confirm the specific design with me." Mid-build: "Shouldn't you also go over the product design
with me?"

## What the AI did
- Read the assignment, proposal and spec from the PDFs. Found the repo contained **no code**.
- Asked about code location, alpha scope, storage, backlog tool, team split, API keys and report format.
- Started scaffolding, was interrupted, then presented the full product design and asked four design questions:
  - voice capture mode: continuous mic, per the spec (the proposal says hold-to-talk)
  - invite type: one shareable link
  - question types: open + 1–5 rating
  - recall-card content: quote + neutral hint
- The human added a requirement: show a ±5 s clip in each card. The agent judged it feasible, but only if recordings are
  made seekable. This led to entry 005.

## Validation
The decisions were written into the README and `docs/decisions/0001–0003`.

## Human correction / what we learned
1. The agent began implementation **before** a design review. The human stopped it to review the design. Lesson: design
   review goes first (now step 2 of the workflow in CLAUDE.md).
2. The human widened the AI-provider scope: "not necessarily Gemini; pick whichever works well without many tokens."
   This became decision 0002 (pluggable providers, one call per session).
