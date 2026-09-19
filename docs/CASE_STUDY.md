# Steady: Making the Web Usable with Tremor and Declining Motor Control

*Case study skeleton. Sections marked **[TODO]** need the owner's voice, the study results, or both. Source material: `DESIGN_LOG.md` (per-phase decisions), `STUDY_PROTOCOL.md`, and `docs/store/` (screenshots).*

**Role:** [TODO: solo designer/engineer] · **Timeline:** [TODO] · **Stack:** TypeScript, Chrome MV3, esbuild, Vitest, Playwright, axe-core · **Links:** [TODO: repo] · [TODO: demo] · [TODO: 90 s video]

---

## 1. Problem

The web assumes a steady hand. Targets are small (the WCAG 2.2 minimum is 24×24 px, and many sites go smaller), menus close the moment the pointer drifts, pop-ups vanish in three seconds, and double-clicks demand precise timing. For roughly 10 million people with Parkinson's disease and about 30,000 people in the US living with ALS at any time [TODO: verify and cite figures], these assumptions turn everyday tasks into physical work.

Existing options sit at the extremes. OS-level tools (mouse keys, sticky keys, dwell software) are hard to configure and know nothing about the page. Specialist AAC hardware is expensive. Nothing in the browser smooths tremor *and* understands which things on a page are clickable.

[TODO: 2–3 sentences from a real conversation or a forum observation that motivated this.]

## 2. Users

| User | Core difficulty | What Steady does |
| --- | --- | --- |
| Person with Parkinson's | 4–6 Hz tremor, slow initiation, fatigue that varies with medication | Adaptive cursor smoothing, target snapping, hover menus that wait |
| Person with early ALS | Reduced range and precision | Snapping plus dwell click |
| Person with mid/late ALS | Little or no hand use | Single-switch scanning |
| Caregiver / OT | Sets up on someone else's behalf | Profiles, import/export, a plain-language settings page |

[TODO: one short persona or anonymised participant vignette per row, once the study has run.]

## 3. Principles

1. **User agency over automation.** Every automated action is visible before it happens and can be cancelled: the ring before a snap-click, the countdown before a dwell click, and **Esc** for both.
2. **No time pressure.** Nothing in Steady times out, and Steady removes the page's own time pressure where it can.
3. **Swappable input, stable interaction.** Mouse, dwell, and switch all share one activation path, one option picker, and one notices drawer.
4. **Fail open.** Every page hook is guarded. Any error removes Steady from the page. **Ctrl+Shift+S** turns it off per tab.
5. **Privacy.** No network requests, no analytics, study logging opt-in and local. Websites cannot detect Steady's settings.

## 4. Key decisions

### 4.1 A ghost cursor, because you can't move the real one
Extensions can't move the OS cursor. Steady draws a filtered "ghost" cursor and acts at its position. The cost is two cursors (fixed by optionally hiding the system one) and CSS `:hover` that still follows the real pointer.
**Filter:** the 1€ filter (Casiez et al., 2012). In unit tests on a synthetic 5 Hz tremor, it removed 72–84% of shake energy with 7–12 px of lag. An exponential filter needed about 29 px of lag to match, which users feel as a "swimming" cursor.
*Visual: `docs/store/1-tremor-smoothing.png`.*

### 4.2 Bubble cursor with hysteresis, and clicks on release
Snapping to the nearest target (Grossman & Balakrishnan, 2005) makes every button effectively bigger. Two refinements came from testing:
- **8 px hysteresis**, so the highlight doesn't flicker between adjacent buttons: jittering ±4 px across a 4 px gap produced 0 changes in 1.5 s.
- **Activation on release (WCAG 2.5.2).** A redirected click fires only if the same target is still highlighted when the button is released, so sliding away cancels.
*Visual: `docs/store/2-target-snap.png`.*

### 4.3 Rest zones: solving the Midas touch
Dwell click turns every pause into a click (Jacob, 1990). Steady's answer: after about 2 s of stillness on empty space, it enters a visible "Resting" state, and nothing fires until the hand deliberately moves. The e2e test rests 5 s, drifts 3 px, and confirms no click.
*Visual: `docs/store/3-dwell-click.png`.*

### 4.4 The triangle of intent, and which pointer to trust
Hover menus are hostile to shaky hands. Steady keeps a menu open while the pointer travels inside the convex hull between the exit point and the menu. **The interesting failure:** the first version watched the smoothed ghost, but the page's hover follows the *real* pointer, which crosses the gap first, so the menu had already closed. The fix was to watch the real pointer for mouse users and the ghost for switch and head input.

### 4.5 Switch scanning that stays navigable
Landmarks → headings → controls, with lists chunked into 8s so no level exceeds 10 entries. A breadcrumb ("Header › Items 1–8 › Link 2 of 8: Section 1") is read aloud by screen readers.
*Visual: `docs/store/4-switch-scanning.png`.*

### 4.6 Smaller decisions worth a sentence each
- `<select>` under dwell or switch opens Steady's own option list, because the native dropdown is outside the page and would trap the user.
- Toasts go to a persistent "Page messages" drawer; only *cleared or hidden* messages count, so status regions don't spam it.
- The demo bridge is origin-gated: revealing assistive-tech use to arbitrary sites would be a disability disclosure.

## 5. Study method

Remote, within-subjects, counterbalanced (A/B), with [TODO: n] participants with [TODO: conditions]. Each ~60-minute session covered:
- calibration;
- an ISO 9241-9 pointing task (3 widths × 2 distances × 15 trials);
- three everyday tasks (a form, a two-level hover menu, and a pop-up with a 24 px close button);
- SUS and raw NASA-TLX after each condition;
- a semi-structured interview on control, trust, and fatigue.

Full protocol: `STUDY_PROTOCOL.md`.
**Measurement caveat:** snapping moves click endpoints to target centres, which inflates ISO effective throughput, so nominal throughput is the primary measure.

## 6. Results

[TODO after the study. Suggested figures:]
- **Throughput** (bits/s), baseline vs Steady: a per-participant slope graph. **[TODO]**
- **Error rate** by target width: grouped bars. **[TODO]**
- **Everyday tasks:** completion and time per task. **[TODO]**
- **SUS / TLX:** paired dot plot. **[TODO]**
- **Themes** from interviews, with one quote each: *control*, *trust*, *fatigue*, *fit with daily life*. **[TODO]**

Engineering results (already measured):

| Metric | Budget | Measured |
| --- | --- | --- |
| Content-script cost per pointer sample | < 1 ms | mean 0.014–0.018 ms, p95 0.1 ms, max 0.7 ms (Guardian, httpbin form, W3C menubar; 5 min each) |
| Scanner rebuild after a large DOM mutation | < 16 ms | 2.5–4.0 ms (3,000-link fixture), max 2.9 ms over 68 rebuilds (Guardian) |
| Settings change → other tabs | < 1 s | ~100–300 ms |
| axe-core violations (options, popup, demo) | 0 | 0 |
| Steady console errors in 5 min per real site | 0 | 0 (see DESIGN_LOG, Phase 8) |
| Automated tests | — | 81 unit, 31 e2e |

## 7. What I cut

- **Head tracking (S2)** and **predictive targeting (S3):** switch scanning (S1) served the least-served users. S2 needs an offscreen document, a camera permission, and a WASM model.
- Cross-iframe snapping; open shadow roots in the scanner; holding CSS-only `:hover` menus.
- Text entry aids (word prediction, an on-screen keyboard); typing Space while scanning with the Space switch.
- Firefox/Safari ports; any telemetry.

## 8. Next

[TODO: prioritise after the study.] Candidates:
- Head tracking via MediaPipe in an offscreen document.
- An on-screen keyboard for switch users.
- Per-site learned profiles (for example, larger snap radius on dense sites).
- An OT-facing "setup session" mode.
- A longitudinal diary study: does Steady reduce fatigue over a week?

## References

- Casiez, G., Roussel, N., & Vogel, D. (2012). 1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems. *CHI '12*.
- Grossman, T., & Balakrishnan, R. (2005). The Bubble Cursor: Enhancing Target Acquisition by Dynamic Resizing of the Cursor's Activation Area. *CHI '05*.
- Jacob, R. J. K. (1990). What You Look At Is What You Get: Eye Movement-Based Interaction Techniques. *CHI '90*.
- Soukoreff, R. W., & MacKenzie, I. S. (2004). Towards a standard for pointing device evaluation: Perspectives on 27 years of Fitts' law research in HCI. *IJHCS 61*(6).
- W3C (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*: 2.5.8 Target Size (Minimum), 2.2.1 Timing Adjustable, 2.5.2 Pointer Cancellation.
- Brooke, J. (1996). SUS: A "quick and dirty" usability scale. · Hart, S. G., & Staveland, L. E. (1988). Development of NASA-TLX.
