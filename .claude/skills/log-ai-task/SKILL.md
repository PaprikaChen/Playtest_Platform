---
name: log-ai-task
description: Write an entry in docs/ai-log/ for the AI-assisted task just completed (requirement, prompt, what the AI did, validation, human correction). Use after finishing any task that produced a commit, or when the Stop hook reports an unlogged commit.
---

# Log an AI task

Our proposal promises a record of every AI task. Write one entry per completed task.

1. Find the next id: the highest `NNN` in `docs/ai-log/` plus 1, zero-padded to 3 digits.
2. Collect the facts. **Do not invent any of them.**
   - **Requirement:** the issue's acceptance criteria, or the user's request.
   - **Prompt:** the user's words verbatim when short. Otherwise write a faithful summary and label it "(faithful summary)".
     Translate non-English prompts and say so.
   - **Commits:** `git log --format=%h -n <k>` for this task's commits.
   - **Validation:** the exact commands run and their results (test counts, browser checks, screenshots). Record anything
     you could **not** verify under "Not verified".
   - **Human corrections:** each time the human changed direction, rejected output or fixed something. Zero is fine; don't
     inflate it.
   - **caught_by:** how each defect was found: `unit-test | browser-test | type-check | review | human`.
3. Create `docs/ai-log/NNN-short-slug.md` using the format in `docs/ai-log/README.md`. Fill every frontmatter field; the
   stats script parses them.
4. Keep it short: 10–25 lines of body. Name the lesson learned in one sentence.
5. Commit the entry, together with the task's final commit or as `docs(ai-log): NNN <slug>`.
