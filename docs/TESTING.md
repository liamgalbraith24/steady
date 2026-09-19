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
