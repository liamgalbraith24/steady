// Wires InputSource → Filter → TargetSnap → DwellController → Overlay + dispatch.
// The filtered cursor is virtual: a content script cannot move the OS cursor, so
// Steady draws a "ghost cursor" at the filtered position and acts there.
import type { Profile } from '../shared/settings';
import type { StudyLogger } from '../shared/logging';
import { tremorOffset } from '../shared/tremor';
import { activate, hoverTransition } from './dispatch';
import { DwellController, type DwellEvent } from './dwell/DwellController';
import { createFilter, type Filter } from './filters/Filter';
import type { InputSource, IntentEvent, PointerSample } from './input/InputSource';
import { MouseSource } from './input/MouseSource';
import { Overlay } from './overlay/overlay';
import { PerfStats } from './perf';
import { TargetScanner, type Candidate } from './targets/scanner';
import { SnapController, magnifyGrow } from './targets/snap';

export interface PipelineHooks {
  logger: StudyLogger;
  doubleClick: () => boolean;
  onFatal: (err: unknown) => void;
}

type ActivationVia = 'click' | 'dwell' | 'switch';

const describe = (el: Element) => {
  const role = el.getAttribute('role');
  return role ? `${el.tagName.toLowerCase()}[role=${role}]` : el.tagName.toLowerCase();
};

export class Pipeline {
  private readonly overlay = new Overlay();
  private readonly scanner: TargetScanner;
  private readonly snap = new SnapController();
  private readonly dwell: DwellController<Element>;
  private source: (InputSource & { onLeave?(cb: () => void): void }) | null = null;
  private filter: Filter;
  private filterKey = '';
  private raw: PointerSample | null = null;
  private ghost: PointerSample | null = null;
  private hovered: Element | null = null;
  private frame = 0;
  private simTremor = 0;
  private simFrame = 0;
  private settleFrame = 0;
  private restTimer: ReturnType<typeof setTimeout> | undefined;
  private lastReal: PointerSample | null = null;
  private destroyed = false;
  /** A redirected physical press waiting for release (WCAG 2.5.2 pointer cancellation). */
  private pendingPress: Element | null = null;
  /** Swallow the rest of a redirected trusted gesture (pointerup → mouseup → click). */
  private blockingGesture = false;
  private topLayerCount = 0;
  /** Main-thread cost per input sample, per rendered frame, and per scanner rebuild. */
  readonly perf = { sample: new PerfStats(), render: new PerfStats(), scan: new PerfStats() };

  constructor(
    private profile: Profile,
    private readonly hooks: PipelineHooks,
  ) {
    this.filter = createFilter(profile.filter);
    this.filterKey = JSON.stringify(profile.filter);
    this.dwell = new DwellController(profile.dwell);
    this.scanner = new TargetScanner({
      extra: () => this.overlay.interactiveElements(),
      onRebuild: this.guard((added: Element[]) => this.onScannerRebuild(added)),
      time: (fn) => this.perf.scan.time(fn),
    });
  }

  /** Wrap every page-facing callback: any exception tears Steady down (fail open). */
  private guard<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R | undefined {
    return (...args: A) => {
      if (this.destroyed) return undefined;
      try {
        return fn(...args);
      } catch (err) {
        this.hooks.onFatal(err);
        return undefined;
      }
    };
  }

  start() {
    this.overlay.mount();
    this.scanner.start();
    this.startSource();
    this.applyCursorStyle();
    window.addEventListener('pointerup', this.onGestureEvent, { capture: true });
    window.addEventListener('mouseup', this.onGestureEvent, { capture: true });
    window.addEventListener('click', this.onGestureEvent, { capture: true });
  }

  private startSource() {
    this.source?.stop();
    const src = new MouseSource();
    src.onSample(this.guard((s: PointerSample) => this.onSample(s)));
    src.onIntent(this.guard((e: IntentEvent) => this.onIntent(e)));
    src.onLeave(this.guard(() => this.onLeave()));
    src.start();
    this.source = src;
  }

  setProfile(p: Profile) {
    this.profile = p;
    const key = JSON.stringify(p.filter);
    if (key !== this.filterKey) {
      this.filterKey = key;
      this.filter = createFilter(p.filter);
    }
    this.dwell.configure(p.dwell);
    if (!this.dwellActive()) this.dwell.reset();
    this.applyCursorStyle();
    this.recapture();
  }

  /**
   * Demo-only: add a synthetic 5 Hz tremor. Real tremor never stops, so while it is on,
   * samples are generated every frame from the last real position (not only on pointermove).
   */
  setSimulatedTremor(px: number) {
    this.simTremor = px;
    cancelAnimationFrame(this.simFrame);
    this.simFrame = 0;
    if (px > 0) {
      const tick = this.guard((now: number) => {
        if (this.lastReal) this.process({ x: this.lastReal.x, y: this.lastReal.y, t: now });
        this.simFrame = requestAnimationFrame(tick);
      });
      this.simFrame = requestAnimationFrame(tick);
    }
    this.applyCursorStyle();
    this.scheduleRender();
  }

  perfSummary() {
    return {
      sample: this.perf.sample.summary(),
      render: this.perf.render.summary(),
      scan: this.perf.scan.summary(),
      lastRebuildMs: Math.round(this.scanner.lastRebuildMs * 1000) / 1000,
      candidates: this.scanner.candidates.length,
    };
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.simFrame);
    cancelAnimationFrame(this.settleFrame);
    clearTimeout(this.restTimer);
    this.source?.stop();
    this.scanner.stop();
    window.removeEventListener('pointerup', this.onGestureEvent, { capture: true });
    window.removeEventListener('mouseup', this.onGestureEvent, { capture: true });
    window.removeEventListener('click', this.onGestureEvent, { capture: true });
    this.overlay.destroy();
  }

  private applyCursorStyle() {
    // With simulated tremor the real (steady) cursor would spoil the illusion, so hide it too.
    const hide = this.profile.cursor.showGhost && (this.profile.cursor.hideSystemCursor || this.simTremor > 0);
    this.overlay.setSystemCursorHidden(hide);
  }

  // --- Stages -------------------------------------------------------------------

  private onSample(s: PointerSample) {
    this.lastReal = s;
    if (this.simTremor > 0) return; // the simulation loop produces the samples
    this.process(s);
    this.scheduleSettle();
  }

  /**
   * The filter only moves when fed samples, and a still mouse sends none, so the
   * ghost would stop short of where the pointer came to rest. Keep feeding the last
   * position each frame until the ghost has caught up.
   */
  private scheduleSettle() {
    if (this.settleFrame) return;
    const tick = this.guard((now: number) => {
      this.settleFrame = 0;
      const r = this.lastReal;
      if (!r || this.simTremor > 0 || !this.ghost) return;
      if (Math.hypot(this.ghost.x - r.x, this.ghost.y - r.y) < 0.3) return;
      if (now - r.t > 16) this.process({ x: r.x, y: r.y, t: now });
      this.settleFrame = requestAnimationFrame(tick);
    });
    this.settleFrame = requestAnimationFrame(tick);
  }

  private process(s: PointerSample) {
    this.perf.sample.time(() => this.processSample(s));
  }

  private processSample(s: PointerSample) {
    this.hooks.logger.sample(this.profile.input.source);
    let input = s;
    if (this.simTremor > 0) {
      const { dx, dy } = tremorOffset(s.t, { amplitudePx: this.simTremor, frequencyHz: 5 });
      input = { x: s.x + dx, y: s.y + dy, t: s.t };
    }
    this.raw = input;
    this.ghost = this.filter.apply(input);
    this.recapture();
    this.stepDwell(s.t);
  }

  private dwellActive(): boolean {
    return this.profile.dwell.enabled && this.profile.input.source !== 'switch';
  }

  /** Advance the dwell state machine (on samples, and on animation frames while dwelling). */
  private stepDwell(t: number) {
    if (!this.dwellActive() || !this.ghost) return;
    const ev = this.dwell.update(this.ghost, this.snap.captured?.el ?? null, t);
    if (ev) this.onDwellEvent(ev);
    if (this.dwell.state === 'dwelling' || this.dwell.state === 'resting') this.scheduleRender();
    // A still pointer sends no samples: check again when the rest threshold could be crossed.
    clearTimeout(this.restTimer);
    if (this.dwell.state === 'idle' && this.profile.dwell.restZoneEnabled) {
      this.restTimer = setTimeout(this.guard(() => this.stepDwell(performance.now())), 2 * this.profile.dwell.dwellMs + 50);
    }
  }

  private onDwellEvent(ev: DwellEvent<Element>) {
    switch (ev.type) {
      case 'fire': {
        const cand = this.snap.captured;
        if (cand && cand.el === ev.target) this.activateTarget(cand, 'dwell');
        break;
      }
      case 'cancel':
        this.hooks.logger.log('dwellCancel', { target: describe(ev.target), progress: Math.round(ev.progress * 100) / 100, reason: ev.reason });
        break;
      case 'restStart':
      case 'restEnd':
        this.hooks.logger.log(ev.type);
        break;
    }
  }

  private snapRadius(): number {
    return this.profile.targetAssist.enabled ? this.profile.targetAssist.snapRadiusPx : 0;
  }

  private magnifyScale(): number {
    return this.profile.targetAssist.enabled && this.profile.targetAssist.magnify ? this.profile.targetAssist.magnifyScale : 1;
  }

  /** Run the snap stage for the current ghost position (after a sample, a scroll, or a DOM change). */
  private recapture() {
    const before = this.snap.captured?.el ?? null;
    if (!this.ghost) this.snap.reset();
    else {
      const radius = this.snapRadius();
      const reach = radius + 60 * (this.magnifyScale() - 1) + 1;
      const cands = this.scanner.query(this.ghost.x, this.ghost.y, reach);
      this.snap.update(this.ghost.x, this.ghost.y, cands, radius, this.magnifyScale());
    }
    const after = this.snap.captured?.el ?? null;
    if (before !== after) this.onCaptureChange(before, after);
    this.scheduleRender();
  }

  private onCaptureChange(from: Element | null, to: Element | null) {
    if (to) this.hooks.logger.log('capture', { target: describe(to) });
    // A physical mouse already produces real hover events; other inputs need synthetic ones.
    if (this.profile.input.source !== 'mouse') {
      hoverTransition(this.hovered, to);
      this.hovered = to;
    }
  }

  private onScannerRebuild(_added: Element[]) {
    // Re-raise the overlay above newly opened modal dialogs / popovers.
    const topLayer = document.querySelectorAll('dialog[open], :popover-open').length;
    if (topLayer !== this.topLayerCount) {
      this.topLayerCount = topLayer;
      this.overlay.raise();
    }
    this.recapture();
  }

  private onIntent(e: IntentEvent) {
    if (e.kind === 'cancel') {
      const ev = this.dwell.cancel();
      if (ev) this.onDwellEvent(ev);
      this.scheduleRender();
      if (this.pendingPress) this.hooks.logger.log('pressCancelled', { reason: 'escape' });
      this.pendingPress = null;
      return;
    }
    if (e.kind !== 'activate') return;
    const native = e.native;
    const cap = this.snap.captured;
    if (native) {
      if (this.overlay.contains(native.target)) return; // Steady's own panels handle their clicks
      if (!cap) return; // nothing captured: the page gets the real click (fail open)
      if (native.composedPath().includes(cap.el)) {
        this.hooks.logger.log('activation', { via: 'click', target: describe(cap.el), redirected: false });
        this.dwell.acknowledge();
        return; // the real click already lands on the captured target
      }
      // Redirect: swallow this physical press; activate the captured target on release.
      native.preventDefault();
      native.stopImmediatePropagation();
      this.pendingPress = cap.el;
      this.blockingGesture = true;
      return;
    }
    if (cap) this.activateTarget(cap, 'switch');
  }

  /** Capture-phase handler for the trusted pointerup / mouseup / click of a redirected press. */
  private readonly onGestureEvent = (e: Event) => {
    if (!e.isTrusted || !this.blockingGesture) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'pointerup') {
      const el = this.pendingPress;
      this.pendingPress = null;
      const cap = this.snap.captured;
      if (el && cap && cap.el === el) this.guard(() => this.activateTarget(cap, 'click'))();
      else if (el) this.hooks.logger.log('pressCancelled', { reason: 'moved-away' });
      setTimeout(() => (this.blockingGesture = false), 500); // in case no click follows
    } else if (e.type === 'click') {
      this.blockingGesture = false;
    }
  };

  private activateTarget(cand: Candidate, via: ActivationVia) {
    this.dwell.acknowledge();
    if (this.overlay.contains(cand.el)) {
      (cand.el as HTMLElement).click();
      this.hooks.logger.log('activation', { via, target: 'steady-ui' });
      return;
    }
    const result = activate(cand.el, {
      doubleClick: this.profile.timePressure.synthesizeDoubleClick && this.hooks.doubleClick(),
      nativePicker: via === 'click',
      openSelect: (select) => this.overlay.showSelectPicker(select, labelFor(select), () => this.scanner.schedule()),
    });
    this.hooks.logger.log('activation', { via, target: describe(cand.el), redirected: true, result });
    this.scanner.schedule();
  }

  private onLeave() {
    this.lastReal = null;
    this.ghost = null;
    this.raw = null;
    this.filter.reset();
    this.dwell.reset();
    this.recapture();
  }

  // --- Rendering ------------------------------------------------------------------

  private scheduleRender() {
    if (!this.frame && !this.destroyed) this.frame = requestAnimationFrame(this.guard(() => this.render()));
  }

  private render() {
    this.frame = 0;
    this.stepDwell(performance.now());
    this.perf.render.time(() => this.draw());
  }

  private draw() {
    const { cursor, targetAssist } = this.profile;
    this.overlay.setGhost(cursor.showGhost ? this.ghost : null);
    this.overlay.setRaw(this.simTremor > 0 ? this.raw : null);
    const cap = this.snap.captured;
    if (cap && targetAssist.enabled) {
      this.overlay.setHighlight(cap.rect, targetAssist.highlightStyle, magnifyGrow(cap.rect, this.magnifyScale()));
    } else this.overlay.setHighlight(null);
    const dwelling = this.dwellActive() && this.ghost && this.dwell.state === 'dwelling';
    this.overlay.setDwell(dwelling && this.profile.dwell.showCountdown ? this.ghost : null, this.dwell.progress);
    this.overlay.setResting(this.dwellActive() && this.dwell.state === 'resting' ? this.ghost : null);
  }
}

function labelFor(el: HTMLSelectElement): string {
  const label = el.labels?.[0]?.textContent ?? el.getAttribute('aria-label') ?? el.name ?? 'an option';
  return label.replace(/\s+/g, ' ').trim().slice(0, 80) || 'an option';
}
