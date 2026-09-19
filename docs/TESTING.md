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
