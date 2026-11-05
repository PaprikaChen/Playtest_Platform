---
id: 012
date: 2026-11-05
issue: null
agent: claude-code
model: claude-opus-5-5
type: feature
commits: [d0974bc]
outcome: accepted-with-fixes
human_corrections: 1
caught_by: [browser-test, review, human]
---
## Requirement
The UI was confusing to the human. They asked for:
- clear, few-word labels on every region
- a more premium look with a bluer accent
- "Lantern Hop" labeled as the game name
- a way to switch between projects
- an online search for better UI skills
- a retest of everything for bugs

## Prompt (faithful summary, translated from Chinese)
"The UI is a bit unclear; as a user I don't know what each part does. Label each area with a few words, not sentences.
Make it look better and more premium; the blue is too purple. Label Lantern Hop: is it the game name? We'll have more
than one project, so where do I choose? Look online for skills that make the UI better. Retest everything for bugs."

## What the AI did
- Researched UI skills online and read the official Anthropic `frontend-design` SKILL.md. Followed its two-pass method
  (token plan, then a check against generic defaults) and removed the five patterns it flags that pass 1 had used.
- Built a new visual system: cool background, Signal Blue, display + body font pairing, a logo, and a `Panel`
  component (title + tag) used for every region.
- Added a game switcher in the header and labeled the game everywhere ("Game", "Build", "Testing").
- Retested:
  - a new E2E edge-case file (invalid ZIP, comments-only session, turned-off link + 403 on game files, switcher, phone
    width, double submit, delete redirect)
  - a 16-case API sweep with curl
  - screenshot review

## Bugs found and fixed
1. **Abandoned sessions were stuck on "Playing now" forever, and their recording was never assembled** (found in real
   dev data). They are now closed after 30 minutes without activity, processed, and labeled "Left early". Covered by a
   unit test.
2. Malformed JSON was silently treated as `{}` and returned 200. A shared `readJson` now returns 400.
3. Turning off an unknown invite returned 200. It now returns 404.
4. Deleting a session used `router.back()`, which can leave the app. It now goes to the game page.
5. Copy link crashed where `navigator.clipboard` is missing (plain-http LAN addresses). It now falls back to letting
   the user select the link.
6. Layout: the Feedback title had no padding, and the invite card buttons wrapped (both seen in screenshots).
   `Panel flush` fixes the first; the card was reorganised for the second.

## Validation
24 unit tests, 6 E2E tests (real Chrome), lint, typecheck and the production build all pass. Screenshots reviewed:
`docs/screenshots/e2e-*.png`, `ui2-*.png`.

**Not verified:** a screen-reader pass; mobile layout of the play screen during an actual game.

## Human correction / what we learned
The previous pass was judged by its author. The human found it confusing, and the design skill showed it was full of
generic tells. Lesson: run the design checklist before building, and let the user's confusion define the labels.
