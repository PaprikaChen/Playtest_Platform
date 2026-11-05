# 0005: AI summaries per moment, shown to developers AND testers

- **Status:** accepted (2026-11-05, decided by Paprika)
- **Context:** Developers scanning feedback want the meaning of each moment without replaying every clip, and testers
  want help turning their spoken comments into written answers. Invariant 2 says hints must be neutral and must not
  suggest answers; "nothing is filled in automatically" is a promise in the proposal. A summary of what the tester
  *expressed* lives close to that line, so the rules below keep it on the right side.
- **Decision:**
  - The same single recall call (decision 0002) also returns a `summary` per match: 1–2 sentences restating what the
    tester expressed in that comment, **including any suggestion the tester themselves voiced**, in the tester's own
    language. The prompt forbids new sentiment, the model's own advice, and judgement of the game.
  - The summary is stored on `recall_prompts`, sanitised like hints (whitespace-normalised, capped at 400 chars).
  - **Both surfaces show it, always labeled "AI summary":** the developer review (under each reminder) and the tester's
    recall card (under the quote).
  - On the tester card, inserting the summary is an explicit extra button ("Add summary"), the inserted text is plain
    editable text, and the quote and hint are unchanged. Nothing is ever filled in automatically.
  - The keyword placeholder produces **no** summaries (an echo of the quote adds noise, not recall); the UI renders
    cleanly without one, so old sessions and keyless setups are unaffected.
- **Consequences:** Invariant 1 is untouched (quotes still come verbatim from `utterances`); invariant 2 is refined:
  *neutral hint* stays, and the summary may restate the tester's own meaning and suggestions but nothing beyond them.
  Whether summaries steer testers' answers becomes an explicit thing to watch in the pilot (#26) and the provider eval
  (#16) — labeled examples should now also grade summary faithfulness.
