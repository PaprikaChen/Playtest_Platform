# UI pass 1: critique and direction (2026-11-05)

Screens audited from `npm run e2e` screenshots (before: `docs/screenshots/before-ui-pass/`).

## Principles
1. **Testers must trust the recording.** They should always see that their voice is being heard and their work is saved.
2. **Recall cards support the answer; they don't replace it.** The answer box comes first, cards sit underneath as
   "From your playtest", and nothing is pre-filled.
3. **Developers come for feedback.** Once sessions exist, feedback sits above setup.
4. Same tokens everywhere; one accent; red is reserved for recording and destructive actions.

## Problems → changes
| Screen | Problem | Change |
|---|---|---|
| Play | Game doesn't scale; half the screen is empty | Sample game scales its canvas to the frame; dark stage |
| Play | No feedback that the mic works (captions are now off) | Live mic level meter + "Hearing you" state |
| Play | Status text is a cluttered block | Compact status bar: REC dot · time · upload health |
| Survey | Cards at half width compete with the answer; black thumbnails | Answer first, then a full-width "From your playtest" strip with horizontal cards; server-rendered JPEG thumbnails (ffmpeg) |
| Survey | No sense of progress | Sticky footer: "n of m answered" + draft status + Submit |
| Project | Feedback buried below three tall setup columns | Feedback first; setup in a compact sidebar; invite link copyable from the header |
| Project | Questionnaire editor is bulky | Compact rows: number · auto-growing input · type toggle · remove |
| Review | No overview of where comments happened | Marker strip under the video (typed vs spoken), click to seek |
