---
id: 003
date: 2026-11-04
issue: 2
agent: claude-code
model: claude-opus-5-5
type: bugfix
commits: [2bf7a65]
outcome: accepted
human_corrections: 0
caught_by: [unit-test]
---
## Requirement
ZIP validation must reject path traversal (`../evil.js`).

## Prompt
Agent-initiated after the test `rejects path traversal` failed.

## What the AI did
The first version checked `file.name` for `..`. JSZip **silently rewrites** `../evil.js` to `evil.js` in `name`, so the
check never saw the attack and the archive was accepted. The fix checks `unsafeOriginalName` and rejects instead of
silently rewriting.

## Validation
The traversal test passes. A live check also confirmed that `GET /g/<token>/../../etc/passwd` and the URL-encoded variant
both return 404.

## Human correction / what we learned
Code that "looks right" can pass review and still be wrong because of a library's hidden behavior. Writing the attack
case as a test is what caught it.
