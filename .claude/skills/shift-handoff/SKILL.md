---
name: shift-handoff
description: Update docs/HANDOFF.md at the end of a work shift so the next teammate (human or agent) can continue without re-discovering context. Use when someone says they're handing off, ending a shift, or asks what the next person needs to know.
---

# Shift handoff

We work in shifts (one person builds, the next continues). Rewrite `docs/HANDOFF.md` so it reflects **now**.

1. Gather facts. **Don't invent any.**
   - `git log --oneline origin/main..HEAD` and `git status -sb`: what's on the branch, and what's unpushed.
   - The PR state and CI (`gh pr view --json state,statusCheckRollup`, or the app's PR tools).
   - Board/issues: `gh issue list -R PaprikaChen/Playtest_Platform -l "status: in progress"` and the top `status: to do`
     items by priority.
   - The newest `docs/ai-log/` entries, for "Not verified" items and lessons.
2. Update these sections, keeping each short:
   - **State in one paragraph:** what works end to end, and what's verified vs only written.
   - **Run it:** commands; anything the next person must set up (keys, permissions).
   - **Open items, in order:** issue number, the next concrete step, and any blocker.
   - **Not verified / known risks:** copied from AI-log "Not verified" lines that are still true.
   - **Decisions pending a human:** e.g. making the board public, choosing an LLM provider.
   - **Gotchas:** link CLAUDE.md; add only new ones.
3. Put the date and the author's name at the top. Commit it as `docs: handoff YYYY-MM-DD` and log it as an AI task if
   an agent wrote it.
