// Wires InputSource → Filter → (TargetSnap → DwellController) → Overlay + dispatch.
// The filtered cursor is virtual: a content script cannot move the OS cursor, so
// Steady draws a "ghost cursor" at the filtered position and acts there.
import type { Profile } from '../shared/settings';
import type { StudyLogger } from '../shared/logging';
import { tremorOffset } from '../shared/tremor';
import { createFilter, type Filter } from './filters/Filter';
import type { InputSource, IntentEvent, PointerSample } from './input/InputSource';
import { MouseSource } from './input/MouseSource';
import { Overlay } from './overlay/overlay';
import { PerfStats } from './perf';

export interface PipelineHooks {
  logger: StudyLogger;
  doubleClick: () => boolean;
  onFatal: (err: unknown) => void;
}

export class Pipeline {
  private readonly overlay = new Overlay();
  private source: (InputSource & { onLeave?(cb: () => void): void }) | null = null;
  private filter: Filter;
  private filterKey = '';
  private raw: PointerSample | null = null;
  private ghost: PointerSample | null = null;
  private frame = 0;
  private simTremor = 0;
  private simFrame = 0;
  private lastReal: PointerSample | null = null;
  private destroyed = false;
  /** Main-thread cost per input sample, and per rendered frame. */
  readonly perf = { sample: new PerfStats(), render: new PerfStats(), scan: new PerfStats() };

  constructor(
    private profile: Profile,
    private readonly hooks: PipelineHooks,
  ) {
    this.filter = createFilter(profile.filter);
    this.filterKey = JSON.stringify(profile.filter);
  }

  /** Wrap every page-facing callback: any exception tears Steady down (fail open). */
  private guard<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
    return (...args: A) => {
      if (this.destroyed) return;
      try {
        fn(...args);
      } catch (err) {
        this.hooks.onFatal(err);
      }
    };
  }

  start() {
    this.overlay.mount();
    this.startSource();
    this.applyCursorStyle();
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
    this.applyCursorStyle();
    this.scheduleRender();
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

  perfSummary(): Record<string, ReturnType<PerfStats['summary']>> {
    return Object.fromEntries(Object.entries(this.perf).map(([k, v]) => [k, v.summary()]));
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.simFrame);
    this.source?.stop();
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
    this.scheduleRender();
  }

  private onIntent(_e: IntentEvent) {
    // Activation arrives in Phase 3 (target snap).
  }

  private onLeave() {
    this.lastReal = null;
    this.ghost = null;
    this.raw = null;
    this.filter.reset();
    this.scheduleRender();
  }

  // --- Rendering ------------------------------------------------------------------

  private scheduleRender() {
    if (!this.frame && !this.destroyed) this.frame = requestAnimationFrame(this.guard(() => this.render()));
  }

  private render() {
    this.frame = 0;
    this.perf.render.time(() => this.draw());
  }

  private draw() {
    this.overlay.setGhost(this.profile.cursor.showGhost ? this.ghost : null);
    this.overlay.setRaw(this.simTremor > 0 ? this.raw : null);
  }
}
