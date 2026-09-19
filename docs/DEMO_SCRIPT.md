# Steady — 60–90 s Demo Video: Shot List

**Story:** the same five-field form, done three ways: (1) a normal mouse, (2) with a tremor and no help, (3) with a tremor and Steady. The viewer sees the problem, then the fix, in about a minute.

**Setup**
- Chrome at 1280×800 (or 1920×1080 zoomed to 150% for legibility), bookmarks bar hidden, and no other extensions.
- Demo page: `npm run build && node scripts/serve.mjs` → http://localhost:4173/ (or the GitHub Pages URL).
- Record with OBS or the OS recorder at 60 fps and **include the cursor**. Turn on click highlighting in the recorder for shot 2 only.
- Before recording: reset the demo session (section 6 → Start a new session) so the result tables are empty.
- The tremor is **simulated** (the demo's "Simulate tremor" slider, 5 Hz). Say so on screen: *"Simulated 5 Hz tremor"*. Never present it as a real patient.

| # | Time | Shot | Action on screen | On-screen text / voice-over |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:06 | Title card | Steady icon + name on a teal background | **Steady**: making the web usable with a tremor. |
| 2 | 0:06–0:18 | Baseline, no tremor | Condition: *Without Steady*, tremor 0. Section 4a → Start form task → fill all fields at normal speed → Send → "Done in 11 s". | *"For most people, a form takes seconds."* |
| 3 | 0:18–0:36 | Tremor, no help | Tremor slider → **10 px**. The red dot shakes. Start form task again. Show a missed click on the Email field (the click lands on the label), a mis-selected city, and a retry. Cut after about 15 s of struggle. *(Speed up 2× if long; show a "2×" badge.)* | *"With a tremor, every small target is a fight."* Lower third: *Simulated 5 Hz tremor* |
| 4 | 0:36–0:40 | Turn Steady on | Click the Steady toolbar icon → profile **Steady (strong)** → the popup closes. Condition: *With Steady*. | *"Steady smooths the cursor…"* |
| 5 | 0:40–0:58 | Tremor + Steady | Same 10 px tremor. The red dot still shakes, but the black ghost cursor is calm. Move near fields: the yellow ring snaps to each. Click *beside* the Phone field: it still focuses. Open City: the large Steady option list appears. Send → "Done in N s". | *"…snaps to the nearest button…"* then *"…and lets you click without precision."* |
| 6 | 0:58–1:08 | Dwell | Switch the profile to **Rest mode**. Hold the cursor over "Start pop-up task": the ring fills, and it clicks. Hold over the tiny ×: it closes. Then rest on blank space: the "Resting" badge appears and nothing is clicked. | *"Or click just by holding still, and rest without clicking by accident."* |
| 7 | 1:08–1:16 | Switch scanning (optional) | Options → Input method → Switch. On the news fixture, tap Space: the breadcrumb and outline move; hold to select a headline. | *"For people who can't use a mouse at all: one switch."* |
| 8 | 1:16–1:24 | Results | Section 6 table: times with and without Steady, side by side. | *"Same person, same form."* |
| 9 | 1:24–1:30 | End card | Repo URL, demo URL, "Free, open source, no data collected". | — |

**Tips**
- Keep the panic shortcut in reserve: if a take goes wrong, **Ctrl+Shift+S** turns Steady off instantly (it also makes a good 3-second extra shot showing "fail open").
- Record each shot separately and cut on the action.
- Add captions for the whole video (accessibility, and most views are muted).
- Export 1080p H.264, and a GIF of shots 5 and 6 (under 5 MB) for the README.
