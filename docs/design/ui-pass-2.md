# UI pass 2: clarity, blue, labels (2026-11-05)

**Human feedback on pass 1:** confusing (unclear what each area is for); wants short few-word labels on every region;
accent too purple, wants blue; "Lantern Hop" not labeled as a game; no way to switch between projects.

**Method:** followed Anthropic's official `frontend-design` skill (read from `anthropics/claude-plugins-official`).
Pass 1 matched several patterns the skill flags as signs of generated design: a warm cream background, all-caps
labels above headings, `A · B · C` metadata strings, monospace data labels, and `→` in buttons. All are removed.

## Tokens
Ink `#121826` · Slate `#5B6475` · Mist `#F3F5F9` · Paper `#FFFFFF` · Line `#E1E5EC` · **Signal Blue `#1F6FEB`**
(strong `#1859C4`, soft `#E8F1FE`). Red `#E5484D` only for recording and delete.
Type: Bricolage Grotesque (display, a little game character) + Instrument Sans (UI); tabular figures for times.

## Labels (title + few-word tag)
| Screen | Regions |
|---|---|
| Header | Game ▾ switcher (Your games, + New game, All games) |
| Game page | Game *(name)* · Get started · Feedback *sessions from testers* · Questions *asked after playing* · Invite link *share with testers* · Builds *your game files (.zip)* |
| Tester consent | Invited to playtest a game · Build / Testing chips · Step 1: Play · Step 2: Answer · What gets recorded |
| Play | Game / Build bar · Recording status (Mic meter, Upload OK) · Your notes *pinned to the moment* · Add a note *timestamped when you start typing* |
| Questionnaire | Game: *name* · From your playtest *moments you mentioned, replay or add* |
| Review | Tester session · Recording *screen + voice, one timeline* · Moments *click to jump* · Timeline *everything said or typed* · Answers *questionnaire responses* · Data *export or delete* |

## Pass 3 (same day): softer blue, tabs instead of columns
- **Blue:** saturation 84% → 65%. `#3575D4` for buttons and links (white text 4.52:1, still AA); lighter `#4A87DF` for
  decorative fills (markers, ratings, logo); `#2C66BD` for text on blue tints. Lighter-than-this buttons fail AA
  with white text.
- **Layout research:** sidebars suit deep apps, while tabs suit a few sections inside one object. Session-review tools
  keep the transcript next to the video.
- **Game page:** three tabs (Feedback · Questions · Share & builds), each full width with one job. New games open on the
  next setup step; games with feedback open on Feedback. Counts appear on the tabs.
- **Review:** video and timeline stay side by side; the timeline is sticky.
- **Play:** the notes panel can be hidden (a REC pill + time stays in the game bar).
