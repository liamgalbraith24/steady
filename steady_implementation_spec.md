# Steady — Implementation Spec for Coding Agent

**Project:** Browser extension that makes the web usable for people with tremor, slowed movement, and progressively declining motor control (Parkinson's disease, ALS).
**Owner:** Recent CS/HCI graduate building a portfolio project. Treat the owner as a competent engineer who will review your work; ask before making irreversible or architectural decisions not covered here.
**Deliverable:** A working Chrome extension (Manifest V3), a GitHub repo with CI, a demo page, study instrumentation, and a written case study skeleton.

---

## 0. How to work on this project

- Work phase by phase in the order given. Do not start a later phase until the current phase's acceptance criteria pass.
- After each phase, write a short entry in `docs/DESIGN_LOG.md`: what you built, decisions made, alternatives rejected, open questions. The owner will turn this into the portfolio case study.
- Keep a running `docs/TESTING.md` describing how to manually verify each feature on the demo page and on three real sites (a news site, a web form, a web app with hover menus).
- Prefer small, reviewable commits with conventional-commit messages (`feat:`, `fix:`, `docs:`).
- Do not add dependencies without noting why in the design log. The content script must stay small; heavy work goes in the offscreen document.
- When a Chrome API behaves unexpectedly, check the official MV3 docs before working around it, and record the finding.
- Accessibility of the extension's own UI is non-negotiable: every settings control must be keyboard-operable and screen-reader-labeled. Users of this tool may also use other assistive technology.

## 1. Product requirements

### 1.1 Users and their needs

| User | Primary difficulty | What Steady must do |
| --- | --- | --- |
| Person with Parkinson's | Tremor (4–6 Hz), slowed initiation, fatigue that varies with medication timing | Smooth the cursor, make targets bigger, remove time pressure, let them switch profiles quickly |
| Person with early ALS | Reduced range and precision, weakness | Target snapping, dwell click instead of physical click |
| Person with mid/late ALS | Little or no hand use | Head-tracking cursor, single-switch scanning |
| Caregiver / OT | Configures on behalf of user | Clear settings UI, profiles, import/export |

### 1.2 Non-negotiable design principles

1. **User agency over automation.** Every automated action (snap, dwell click) must be visible before it happens and cancelable.
2. **No time pressure.** Nothing in Steady's own UI auto-dismisses or requires a fast action.
3. **Swappable input, stable interaction.** Switching from mouse to head tracking to a switch must not change how targets, dwell, or highlights behave.
4. **Fail open.** If Steady breaks on a page, the page must still be usable with a normal mouse. Wrap all page hooks in try/catch and provide a one-key panic toggle (default `Ctrl+Shift+S`) that disables Steady on the current tab.
5. **Privacy.** Webcam frames never leave the device. No analytics without explicit opt-in. Study logging is off by default.

### 1.3 Feature list

**Phase-gated MVP (must ship):**
- F1 Tremor-filtered cursor
- F2 Target assist (highlight + snap-to-nearest interactive element)
- F3 Dwell click with visible countdown and rest zones
- F4 Time-pressure neutralization (hover menu persistence, toast pausing, double-click removal)
- F5 Settings with profiles, import/export, panic toggle
- F6 Demo/calibration page

**Stretch (build one, in this order of preference):**
- S1 Switch scanning mode
- S2 Head-tracking input via webcam
- S3 Predictive target highlighting

## 2. Architecture

```
steady/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.ts        # settings sync, offscreen doc lifecycle, tab state
│   ├── content/
│   │   ├── index.ts                 # bootstrap; installs InputPipeline on the page
│   │   ├── targets/
│   │   │   ├── scanner.ts           # finds interactive elements, maintains spatial index
│   │   │   └── snap.ts              # bubble-cursor style nearest-target logic
│   │   ├── overlay/
│   │   │   ├── overlay.ts           # shadow-DOM overlay: highlight ring, dwell ring, cursor ghost
│   │   │   └── overlay.css
│   │   ├── input/
│   │   │   ├── InputSource.ts       # interface + event types
│   │   │   ├── MouseSource.ts
│   │   │   ├── SwitchSource.ts      # stretch
│   │   │   └── HeadTrackSource.ts   # stretch; receives positions from offscreen doc
│   │   ├── filters/
│   │   │   ├── Filter.ts            # interface
│   │   │   ├── OneEuroFilter.ts     # primary smoothing filter
│   │   │   └── ExponentialFilter.ts # simple fallback for comparison
│   │   ├── dwell/
│   │   │   └── DwellController.ts
│   │   ├── timepressure/
│   │   │   └── neutralizer.ts       # hover persistence, toast pausing, dblclick synthesis
│   │   └── pipeline.ts              # wires InputSource → Filter → Snap → Dwell → Overlay
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── headtrack.ts             # stretch; MediaPipe Face Landmarker
│   ├── options/
│   │   ├── options.html
│   │   ├── options.ts
│   │   └── profiles.ts
│   ├── popup/
│   │   ├── popup.html               # quick profile switch + panic toggle
│   │   └── popup.ts
│   ├── shared/
│   │   ├── settings.ts              # Settings schema (zod), defaults, migration
│   │   ├── messages.ts              # typed message contracts between contexts
│   │   └── logging.ts               # study logger (opt-in)
│   └── demo/
│       ├── index.html               # calibration + Fitts task + realistic tasks
│       └── demo.ts
├── test/
│   ├── unit/                        # vitest: filters, snap math, settings migration
│   └── e2e/                         # playwright: loads extension, runs demo page
├── docs/
│   ├── DESIGN_LOG.md
│   ├── TESTING.md
│   ├── STUDY_PROTOCOL.md
│   └── CASE_STUDY.md
├── package.json
├── tsconfig.json
├── vite.config.ts                   # use @crxjs/vite-plugin or equivalent
└── .github/workflows/ci.yml
```

### 2.1 Core interfaces

```ts
// shared/settings.ts
export interface Profile {
  id: string;
  name: string;
  filter: { type: 'oneEuro' | 'exponential' | 'none'; minCutoff: number; beta: number; alpha?: number };
  targetAssist: { enabled: boolean; snapRadiusPx: number; highlightStyle: 'ring' | 'fill'; magnify: boolean; magnifyScale: number };
  dwell: { enabled: boolean; dwellMs: number; restZoneEnabled: boolean; restZoneRadiusPx: number; showCountdown: boolean };
  timePressure: { persistHoverMenus: boolean; pauseToasts: boolean; synthesizeDoubleClick: boolean; hoverPersistMs: number };
  input: { source: 'mouse' | 'headtrack' | 'switch'; headtrack?: { gain: number; deadZonePx: number; mirror: boolean }; switch?: { key: string; scanIntervalMs: number } };
}

export interface Settings {
  version: number;
  activeProfileId: string;
  profiles: Profile[];
  enabled: boolean;
  disabledOrigins: string[];      // sites where the user turned Steady off
  studyLogging: { enabled: boolean; participantId?: string };
}
```

```ts
// content/input/InputSource.ts
export interface PointerSample { x: number; y: number; t: number; }   // viewport px, ms
export type IntentEvent =
  | { kind: 'activate' }                // explicit click / switch press
  | { kind: 'cancel' }
  | { kind: 'scanNext' } | { kind: 'scanPrev' };

export interface InputSource {
  start(): void;
  stop(): void;
  onSample(cb: (s: PointerSample) => void): void;
  onIntent(cb: (e: IntentEvent) => void): void;
}
```

```ts
// content/filters/Filter.ts
export interface Filter {
  reset(): void;
  apply(sample: PointerSample): PointerSample;
}
```

Pipeline order is fixed: `InputSource → Filter → TargetSnap → DwellController → Overlay + dispatch`. Each stage is a pure-ish class with its own unit tests.

### 2.2 Message contracts

Define every cross-context message in `shared/messages.ts` as a discriminated union and validate with zod at receipt. Minimum set:
- `SETTINGS_UPDATED` (background → content)
- `PANIC_TOGGLE` (popup → background → content)
- `HEADTRACK_SAMPLE` (offscreen → background → content) — stretch
- `LOG_EVENT` (content → background) — study logging

## 3. Phase-by-phase instructions

### Phase 0 — Scaffold (½ day)

1. Initialize a TypeScript + Vite project using a Manifest V3 extension plugin. Confirm `npm run build` produces a loadable unpacked extension.
2. Write `manifest.json` with: `content_scripts` on `<all_urls>` at `document_idle`, `permissions: ["storage", "offscreen", "scripting"]`, `options_page`, `action` popup, and a keyboard command for the panic toggle.
3. Set up vitest and a single passing test. Set up GitHub Actions to run typecheck, lint, and tests on push.
4. Create `docs/DESIGN_LOG.md` with a first entry describing the stack and why (Vite for fast rebuilds; shadow DOM overlay to avoid page CSS collisions; offscreen doc for webcam because content scripts cannot own long-lived media streams in MV3).

**Acceptance:** Extension loads in Chrome; content script logs "Steady loaded" on any page; CI is green.

### Phase 1 — Settings and profiles (1 day)

1. Implement the zod schema, defaults, and a `migrate(settings)` function keyed on `version`. Write tests for migration from an empty store and from version 1.
2. Ship three default profiles: "Steady (mild)", "Steady (strong)", "Rest mode" (dwell on, filter strong). Each must be editable and duplicatable.
3. Build the options page with plain HTML + TypeScript (no framework; keep bundle small). Every control: labeled, keyboard-focusable, large hit targets (≥ 44×44 px), no hover-only affordances. Include a live "before/after" cursor trace canvas so the user can feel filter settings (this is used again in Phase 2).
4. Implement import/export as JSON download/upload with schema validation and a clear error message.
5. Build the popup: active profile dropdown, per-site enable/disable, panic toggle button, link to options.
6. Sync via `chrome.storage.sync`; broadcast `SETTINGS_UPDATED` to all tabs on change.

**Acceptance:** Change a setting in options → content script in another tab receives it within 1 s. Import of a malformed file shows an error and leaves settings unchanged. Options page passes an axe-core scan with zero violations.

### Phase 2 — Input pipeline and tremor filter (1.5 days)

1. Implement `MouseSource` (listens to `pointermove` on `document`, emits samples; `pointerdown` emits `activate`).
2. Implement `OneEuroFilter` (Casiez et al. 2012). Parameters `minCutoff` and `beta`. Also implement `ExponentialFilter` as a baseline. Unit-test both against a synthetic tremor signal (sine at 5 Hz, amplitude 8 px, added to a linear sweep); assert the filtered path has lower high-frequency energy while endpoint error stays under a threshold.
3. Implement the pipeline. The filtered cursor is *virtual*: Steady draws a "ghost cursor" in the overlay at the filtered position and dispatches synthetic events there; the OS cursor is not moved. Document this trade-off (we cannot move the OS cursor from a content script; the ghost cursor is the price).
4. Add a hidden-cursor option: when the ghost cursor is on, optionally set `cursor: none` via a page-level stylesheet so users see only one cursor.
5. Wire the options page trace canvas to the real filter so tuning is by feel.

**Acceptance:** On the demo page, a simulated tremor (demo page injects jitter into pointer position) is visibly smoothed by the ghost cursor with the "strong" profile. Unit tests pass. No measurable jank on a 60 Hz trace (profile with Chrome DevTools; content script main-thread time per move < 1 ms).

### Phase 3 — Target scanner and snap (1.5 days)

1. `scanner.ts`: enumerate interactive elements: `a[href]`, `button`, `input`, `select`, `textarea`, `summary`, `[role=button|link|checkbox|radio|menuitem|tab|option|switch]`, `[tabindex]:not([tabindex="-1"])`, `[onclick]`, and elements with `cursor: pointer` computed style (use sparingly; it is expensive; sample only within the viewport). Exclude hidden, `aria-hidden`, zero-size, and `disabled` elements.
2. Maintain a spatial index (grid buckets by viewport) that is rebuilt on `MutationObserver` batches (debounced 100 ms), scroll, and resize. Use `IntersectionObserver` to keep only in-viewport candidates.
3. `snap.ts`: implement bubble-cursor logic — the captured target is the element whose bounding box is nearest to the ghost cursor within `snapRadiusPx`. Ties broken by smaller element (harder to hit). Apply hysteresis: a new target must be closer by at least 8 px before capture changes, to prevent flicker.
4. Overlay draws a highlight ring around the captured target. Optional magnify: scale the ring outward so the effective hit area grows; do not transform the page element.
5. Activation dispatches to the captured target, not to the point under the cursor: synthesize `pointerdown/mouseup/click` on the target center. For inputs, call `focus()` first. For `select`, open via `showPicker()` where available.
6. Handle iframes by injecting the content script `all_frames: true` and running independent pipelines per frame; do not attempt cross-frame snapping in MVP (log as future work).

**Acceptance:** On the three real test sites, moving the ghost cursor near a button highlights it and clicking activates it even when the cursor is up to `snapRadiusPx` away. Highlight does not flicker while hovering between two adjacent buttons. Scanner rebuild after a large DOM mutation completes in < 16 ms on the news site (measure and record).

### Phase 4 — Dwell click and rest zones (1 day)

1. `DwellController`: when a target is captured and the ghost cursor remains within `restZoneRadiusPx` of its entry point for `dwellMs`, emit `activate`. Any captured-target change resets the timer.
2. Overlay draws a countdown ring that fills over `dwellMs`; must be visible at 4.5:1 contrast against light and dark pages (draw with a two-tone outline).
3. Rest zones: if the cursor has been stationary on a non-target area for > 2× `dwellMs`, enter "resting" state; dwell does not fire until the cursor moves at least `restZoneRadiusPx`. Show a subtle "resting" indicator. This prevents the Midas-touch problem.
4. Dwell on text inputs focuses the field; a second dwell on an already-focused field does nothing (prevents repeated focus events).
5. Keyboard escape (`Esc`) cancels the current dwell.

**Acceptance:** Hover a target for `dwellMs` → activation; move away at 80% → no activation, ring resets. Resting on blank page space for 5 s then drifting 3 px does not click anything. Unit tests cover timer reset and rest-zone transitions.

### Phase 5 — Time-pressure neutralization (1 day)

1. **Hover persistence:** when a captured target's hover reveals new interactive descendants or a sibling menu (detect via scanner diff within 300 ms of hover), keep dispatching `mouseover` to the trigger for `hoverPersistMs` after the cursor leaves, unless the cursor moves toward the revealed menu (use a triangle-of-intent heuristic: if the cursor is inside the triangle from the trigger to the menu's near corners, keep the menu alive).
2. **Toast pausing:** heuristically detect `role=alert|status`, `aria-live` regions, and common toast class patterns appearing then being removed; when detected, clone their text into a Steady "notices" drawer in the overlay that persists until the user dismisses it. Do not try to stop the page from removing its toast.
3. **Double-click removal:** if a target has a `dblclick` listener (best-effort: detect via `ondblclick` attribute or known patterns), let the user configure "single activation = double click" per site.
4. All three must be individually toggleable; default hover persistence on, toasts on, double-click off.

**Acceptance:** On a site with hover menus, leaving the trigger toward the menu keeps it open; leaving away closes it after `hoverPersistMs`. A page toast that auto-dismisses in 3 s remains readable in the notices drawer.

### Phase 6 — Demo page and study instrumentation (1 day)

1. `src/demo/index.html` hosted via GitHub Pages from the repo. Sections:
   - **Calibration:** live trace canvas, profile picker, "simulate tremor" slider that adds jitter to pointer events (for sighted demos and for the video).
   - **Fitts's-law task:** ISO 9241-9 style ring of 13 circular targets, three widths × two amplitudes, 15 trials per condition. Records movement time, error (miss), and effective throughput. Runs with Steady on and off (the page can request Steady to disable itself via a message; without the extension, it just runs the baseline).
   - **Realistic tasks:** (a) fill a 5-field form and submit, (b) navigate a two-level hover menu to a leaf item, (c) dismiss a modal via its close button. Time and error logging for each.
   - **Questionnaires:** SUS (10 items) and NASA-TLX (6 sliders) forms with local export to JSON.
2. `shared/logging.ts`: opt-in logger keyed by participant ID; buffers events and exports as JSON from the popup. Log: sample rate, filter type, capture changes, dwell fires/cancels, activations, task markers. Nothing is sent over the network.
3. Write `docs/STUDY_PROTOCOL.md`: recruitment message template, consent language (plain language, remote session, right to stop, no webcam recording), session script (10 min intro, 15 min calibration, 20 min tasks × 2 conditions counterbalanced, 10 min interview), interview guide (5 questions focused on trust, control, and fatigue), and a data-analysis plan (paired comparison of throughput and error rate; descriptive SUS/TLX; thematic notes).

**Acceptance:** A full session on the demo page can be completed with keyboard alone; exported JSON contains every task result and questionnaire response; the protocol doc is complete enough for the owner to run a session tomorrow.

### Phase 7 — One stretch feature (2–3 days, choose with owner)

**S1 Switch scanning (recommended first):**
1. `SwitchSource`: one configurable key (default `Space`) or a gamepad button. Short press = advance, long press (≥ 600 ms) = select. Also support two-key mode (advance / select).
2. Scanning hierarchy: landmarks (`main`, `nav`, `header`, `form`, `[role=region]`) → sections (headings) → interactive elements in DOM order. Overlay shows the current scan group with a bold outline and a breadcrumb ("Main › Article › Link 3 of 12").
3. Auto-scan mode: advances every `scanIntervalMs`; a press selects. Manual mode: press advances.
4. Selecting a group descends; a "back" item is always the first entry inside a group.

**S2 Head tracking:**
1. Offscreen document with MediaPipe Face Landmarker (WASM, local). Compute nose-tip position relative to a calibrated center; map to viewport with `gain` and `deadZonePx`; send samples at ≤ 30 Hz.
2. Calibration flow in options: look center, hold 2 s; look at four corners. Store mapping per profile.
3. Never store frames. Show a persistent camera-on indicator in the overlay.
4. `HeadTrackSource` implements `InputSource`; dwell is the only activation mechanism in this mode.

**S3 Predictive targeting:**
1. Fit a kinematic endpoint predictor (e.g., extrapolate from velocity and deceleration over the last 100 ms) and pre-highlight the predicted target with a lighter ring. Do not snap to predictions; only highlight. Log prediction hits/misses for the case study.

**Acceptance (any):** Feature is fully usable on the three real sites, documented in `TESTING.md`, and has at least basic unit coverage.

### Phase 8 — Polish, package, and case study (1 day)

1. Produce a Chrome Web Store-ready build with icons, a privacy policy page (no data collection), and screenshots.
2. Record a 60–90 s demo: same form task with mouse, with simulated tremor unaided, with Steady. Provide a shot list in `docs/DEMO_SCRIPT.md`.
3. Fill `docs/CASE_STUDY.md` skeleton: Problem → Users → Principles → Key decisions (ghost cursor, bubble cursor + hysteresis, rest zones, hover triangle) → Study method → Results (leave placeholders) → What I cut → Next.
4. README: install instructions, feature list with GIFs, architecture diagram (Mermaid), how to run the study.

## 4. Quality bar

- TypeScript strict mode; no `any` without a comment.
- Unit tests for every pure module (filters, snap, dwell state machine, settings migration, scanner selectors).
- One Playwright e2e test that loads the extension, opens the demo page, and completes the form task via dwell.
- Content script main-thread cost: < 1 ms per pointer sample on the news test site.
- Zero axe-core violations on options, popup, and demo page.
- No console errors on the three real test sites for 5 minutes of use.

## 5. Explicitly out of scope

- Firefox/Safari ports.
- Cross-iframe target snapping.
- Cloud sync of profiles beyond `chrome.storage.sync`.
- Any telemetry.
- Text entry aids (word prediction, on-screen keyboard) — note as future work.

## 6. References to cite in docs

- Casiez, Roussel, Vogel. "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input." CHI 2012.
- Grossman & Balakrishnan. "The Bubble Cursor." CHI 2005.
- Jacob. "What You Look At Is What You Get" (Midas touch problem). CHI 1990.
- ISO 9241-9 / Soukoreff & MacKenzie, "Towards a standard for pointing device evaluation." IJHCS 2004.
- Web Content Accessibility Guidelines 2.2 (target size, timing adjustable, pointer cancellation).
