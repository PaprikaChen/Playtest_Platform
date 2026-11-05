# 0005: AI summaries per moment, shown to developers AND testers

- **Status:** accepted (2026-11-05, decided by Paprika)
- **Context:** Developers scanning feedback want the meaning of each moment without replaying every clip, and testers
  want help turning their spoken comments into written answers. Invariant 2 says hints must be neutral and must not
  suggest answers; "nothing is filled in automatically" is a promise in the proposal. A summary of what the tester
  *expressed* lives close to that line, so the rules below keep it on the right side.
- **Decision:**
  - The same single recall call (decision 0002) also returns a `summary` per match: 1–2 sentences **in the tester's
    first person** ("I ..."), phrasing what they expressed in that comment as a possible written answer, **including any
    suggestion the tester themselves voiced**, in the tester's own language (Paprika, 2026-11-05: first person reads as
    a draft answer, not a verdict about the tester). The prompt forbids new sentiment, the model's own advice, and
    judgement of the game.
  - The summary is stored on `recall_prompts`, sanitised like hints (whitespace-normalised, capped at 400 chars).
  - **Both surfaces show it:** the developer review labels it "AI summary"; the tester's recall card labels it
    "One way to put it" (AI provenance stated in the page banner and the label's tooltip).
  - On the tester card, inserting the summary is an explicit extra button ("Use this wording"), the inserted text is
    plain editable text, and the quote and hint are unchanged. Nothing is ever filled in automatically.
  - The keyword placeholder produces **no** summaries (an echo of the quote adds noise, not recall); the UI renders
    cleanly without one, so old sessions and keyless setups are unaffected.
- **Consequences:** Invariant 1 is untouched (quotes still come verbatim from `utterances`); invariant 2 is refined:
  *neutral hint* stays, and the summary may restate the tester's own meaning and suggestions but nothing beyond them.
  Whether summaries steer testers' answers becomes an explicit thing to watch in the pilot (#26) and the provider eval
  (#16) — labeled examples should now also grade summary faithfulness.
