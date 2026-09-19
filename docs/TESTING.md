# Testing Steady

## Automated

```bash
npm run typecheck && npm run lint && npm test   # unit
npm run test:e2e                                # builds, then runs Playwright with the extension loaded
```

e2e tests launch Chromium with `--load-extension=dist`. Branded Google Chrome ≥ 137 ignores that flag, so:
- **CI / Linux:** Playwright's bundled Chromium (`npx playwright install chromium`).
- **Windows, if Playwright's Chromium fails to start** ("side-by-side configuration is incorrect"): install Chrome for Testing and point the tests at it:
  ```bash
  npx @puppeteer/browsers install chrome@stable --path ./.cft
  STEADY_CHROME="<path printed above>/chrome.exe" npm run test:e2e
  ```
- `HEADED=1` shows the browser.

## Loading the extension by hand

1. `npm run build`
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `dist/`.
3. Serve the demo: `node scripts/serve.mjs`, then open <http://localhost:4173/>.

## Real-site test set

Every feature below is checked on the demo page and on three real sites:

| Kind | Site used | Why |
| --- | --- | --- |
| News site | https://www.theguardian.com/international | Dense links, large DOM, frequent mutations (live blogs), ads in iframes |
| Web form | https://www.w3.org/WAI/tutorials/forms/ (examples) / https://httpbin.org/forms/post | Text fields, radios, checkboxes, `select`, submit |
| Web app with hover menus | https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-navigation/ and https://www.amazon.com (hover "Account & Lists") | Hover-revealed menus, JS mouseleave timers |

## Phase 0 — Scaffold

- [ ] Load `dist/`. Open any http(s) page and the DevTools console shows `Steady loaded`.
- [ ] `ci.yml` is green on push.

## Phase 1 — Settings and profiles

Automated: `test/unit/settings.test.ts`, `test/e2e/settings.spec.ts`.

Manual:
- [ ] Options: every control is reachable with Tab and operable with Space/Enter/arrow keys; the focus ring is always visible.
- [ ] Change "Profile to edit" → *Rest mode* → **Use this profile now**. In another tab's console: `Steady: settings updated (profile "Rest mode")` (enable *Verbose* log level).
- [ ] Duplicate a profile, rename it, delete it (the inline confirm appears; **Keep it** returns focus to Delete).
- [ ] Export, then import the exported file → the confirm lists profile names → replace.
- [ ] Import a text file renamed `.json` → a red error names the file; settings are unchanged.
- [ ] Trace canvas: move the mouse with "simulated tremor" on; the thick line is visibly smoother. **Play a sample movement** works from the keyboard.
- [ ] Popup: switch profile, untick "Use Steady on <site>", press the panic button → the badge shows OFF → the status line updates.

## Phase 2 — Filter and ghost cursor

Automated: `test/unit/filters.test.ts`, `test/e2e/filter.spec.ts`.

Manual (demo page, section 1):
- [ ] Profile *Steady (strong)*, simulated tremor 8 px: the red dot shakes and the black ghost cursor stays calm. The system cursor is hidden.
- [ ] Set tremor to 0 and profile to *Steady (mild)*: the ghost follows the real cursor closely with no visible lag on fast moves.
- [ ] Move the pointer out of the window: the ghost disappears.
- [ ] Real sites: move around for a minute. The ghost tracks smoothly and there are no console errors.
- [ ] Perf: in DevTools Performance, record 10 s of movement on the news site. Steady's `pointermove` handler should be < 1 ms (also in the demo console: `postMessage({source:'steady-demo',type:'GET_PERF'})`).

## Phase 3 — Target snap

Automated: `test/unit/snap.test.ts`, `test/unit/scanner.test.ts`, `test/e2e/snap.spec.ts` (fixtures in `test/fixtures/`, served at `/fixtures/`).

Manual, on each real site:
- [ ] **News:** move near a headline link. The yellow/black ring appears before you reach it. Click in the whitespace next to it (within about 40 px): the link opens.
- [ ] **News:** hover in the gap between two adjacent nav links, moving slightly. The ring stays on one link.
- [ ] **Form:** click near (not on) a text field: it is focused. Click near a `<select>`: the native picker opens.
- [ ] **Hover-menu app:** nav items highlight; clicking beside one activates it.
- [ ] Press down near a button, slide away, and release: nothing is clicked.
- [ ] **Perf:** in the news site's DevTools console, run `performance.mark` around a scroll, or read "scanner rebuild" in a Performance recording. Record the rebuild time in DESIGN_LOG (target < 16 ms).
- [ ] Iframe (for example an embedded YouTube player): the ghost moves into the frame; the parent's ghost disappears.

## Phase 4 — Dwell

Automated: `test/unit/dwell.test.ts`, `test/e2e/dwell.spec.ts`.

Manual (profile *Rest mode*, or turn on "Click by dwelling"):
- [ ] Hover a link and hold still: a yellow ring fills next to the cursor, then the link opens.
- [ ] Hover and move away at about 80%: the ring disappears and nothing happens.
- [ ] Leave the cursor on empty space for about 3 s: the "Resting" badge appears. Nudge it 2–3 px: nothing is clicked. Move about 20 px: the badge disappears.
- [ ] Hold on a text field: it is focused, and typing works. Hold again: nothing new happens.
- [ ] Hold on a `<select>` (form site): Steady's large option list opens; hold on an option to choose it.
- [ ] Press `Esc` while the ring is filling: it cancels.
- [ ] The ring is clearly visible on a white page and on a dark page (for example GitHub in dark mode).

## Phase 5 — Time pressure

Automated: `test/unit/timepressure.test.ts`, `test/e2e/timepressure.spec.ts` (fixture `test/fixtures/menu.html`).

Manual:
- [ ] **Hover-menu site** (W3C APG menubar example; Amazon "Account & Lists"): open a menu and move slowly and diagonally to a lower item. The menu stays open. Move straight away from it: it closes about 1.5 s later.
- [ ] Turn off "Keep hover menus open" in options, then repeat: the menu closes as it normally would.
- [ ] **Toasts:** on a site that shows auto-dismissing messages (for example GitHub's "Copied!", or any form "Saved" message), the message appears in Steady's *Page messages* drawer after it vanishes. **Dismiss** and **Dismiss all** work by click, dwell, and keyboard (Tab into the drawer).
- [ ] **Double click:** add a site in options → Sites and tick "one click = double click". On a file-list app (for example a webmail folder list that opens on double click), a single click opens the item. On unlisted sites, nothing changes.

## Phase 6 — Demo and study

Automated: `test/unit/fitts.test.ts`, `test/e2e/demo.spec.ts`.

Manual:
- [ ] Run `node scripts/serve.mjs` and open http://localhost:4173/. The status reads "Steady is on…" and "With Steady" is selected.
- [ ] Complete one pointing round with the mouse, then switch to "Without Steady" and complete one. Section 6 shows two condition rows, and nominal throughput is higher with Steady.
- [ ] Simulated tremor 10 px, "Without Steady": the red dot shakes and clicks land where the dot is (baseline misses).
- [ ] Everyday tasks a–c with the mouse; each shows "Done in N s".
- [ ] Reload mid-session: the results are still there.
- [ ] **Download session (JSON)**, and check the file contains trials, tasks, and questionnaires.
- [ ] Popup (with study logging on): the event count increases during tasks; **Export log** downloads JSON with `task:*` markers.
- [ ] Complete the whole page with the keyboard only (Tab, Enter, Space, arrows).

## Phase 7 — Switch scanning

Automated: `test/unit/scan.test.ts`, `test/unit/switch.test.ts`, `test/e2e/switch.spec.ts`.

Setup: Options → Input method → "Switch or single key (scanning)". Set the switch key (default Space), and optionally a second switch (for example Enter) and automatic mode.

On each real site:
- [ ] **News:** a breadcrumb appears at the top (for example "Header (12 items)") with a thick yellow/black outline. Tap to move between areas, hold to enter, and reach a headline link in under about 10 presses via "Items 1–8" chunks. Holding opens it. The page does not scroll when Space is pressed.
- [ ] **Form:** reach a text field and select it: it is focused. Reach a `<select>`: the Steady option list opens and is scanned.
- [ ] **Hover-menu app:** highlighting a menu trigger opens its menu; scanning into it keeps it open.
- [ ] Automatic mode at 1,500 ms: the highlight advances by itself, and one press selects.
- [ ] `Escape` goes back up one level. The panic shortcut still works.
- [ ] Screen reader (NVDA / VoiceOver): the breadcrumb is announced on each move.

## Phase 8 — Release checks

- [ ] `npm run package` → load the zip's contents unpacked and smoke test.
- [ ] `STEADY_CHROME=… npm run realsites -- 300` → no `steadyMessages` on any site; `perf.sample.p95Ms` < 1.
- [ ] `npm run screenshots` → review `docs/store/`.
- [ ] Privacy page linked from the demo footer and the store listing.
