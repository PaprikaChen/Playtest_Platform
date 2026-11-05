# 0002: Recall prompts: one LLM call per session, ID-grounded output

- **Status:** accepted (2026-11-04)
- **Context:** Recall cards must be faithful to what the tester said (proposal: "neutral comments must not become negative
  judgments"), and we want low token cost. The provider (Gemini / OpenAI / Claude) hasn't been chosen yet.
- **Decision:**
  - Send all questions and all comments in **one** compact prompt per session and ask for JSON matches only.
  - The model returns only `question_id`, `utterance_id` and a short neutral `hint`. It never returns quotes.
  - `sanitizeMatches` drops unknown IDs and duplicates, and caps each question at 3 matches.
  - The UI shows the quote from the database.
  - The provider is chosen by env var. With no key, a deterministic keyword matcher runs and is labeled "placeholder" in the UI.
- **Consequences:** the model cannot misquote a tester. Cost grows linearly with comment count, not with question count.
  The keyword placeholder let us build and demo the whole flow with zero tokens. Choosing a provider needs a labeled eval
  set (#16).
