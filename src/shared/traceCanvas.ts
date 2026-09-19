// Live "before / after" trace: raw pointer path vs. the path after Steady's filter.
// Used on the options page (tuning by feel) and on the demo page (calibration).
import { createFilter, type Filter } from '../content/filters/Filter';
import type { PointerSample } from '../content/input/InputSource';
import type { FilterConfig } from './settings';
import { tremorOffset } from './tremor';

const HISTORY_MS = 2500;

export interface TraceOptions {
  getFilter: () => FilterConfig;
  getTremorAmplitude: () => number; // px; 0 = none
  /** Called with a plain-language summary after movement settles (for screen readers). */
  onSummary?: (text: string) => void;
}

/** Sum of squared second differences: a cheap proxy for high-frequency "shake" energy. */
export function shakeEnergy(path: readonly PointerSample[]): number {
  let e = 0;
  for (let i = 2; i < path.length; i++) {
    const ax = path[i]!.x - 2 * path[i - 1]!.x + path[i - 2]!.x;
    const ay = path[i]!.y - 2 * path[i - 1]!.y + path[i - 2]!.y;
    e += ax * ax + ay * ay;
  }
  return e;
}

export class TraceCanvas {
  private raw: PointerSample[] = [];
  private filtered: PointerSample[] = [];
  private filter: Filter;
  private filterKey = '';
  private frame = 0;
  private playing = 0;
  private summaryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: TraceOptions,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.filter = this.ensureFilter();
    canvas.addEventListener('pointermove', (e) => {
      if (this.playing) return;
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      for (const ev of e.getCoalescedEvents?.() ?? [e]) {
        this.push({ x: (ev.clientX - r.left) * sx, y: (ev.clientY - r.top) * sy, t: ev.timeStamp });
      }
    });
    canvas.addEventListener('pointerleave', () => this.filter.reset());
    this.draw();
  }

  private ensureFilter(): Filter {
    const cfg = this.opts.getFilter();
    const key = JSON.stringify(cfg);
    if (key !== this.filterKey) {
      this.filterKey = key;
      this.filter = createFilter(cfg);
    }
    return this.filter;
  }

  /** Recreate the filter (call when settings change). */
  refresh() {
    const before = this.filterKey;
    this.ensureFilter();
    if (before === this.filterKey) return;
    this.filtered = [];
    this.raw = [];
    this.draw();
  }

  private push(p: PointerSample) {
    const amp = this.opts.getTremorAmplitude();
    const { dx, dy } = tremorOffset(p.t, { amplitudePx: amp, frequencyHz: 5 });
    const noisy = { x: p.x + dx, y: p.y + dy, t: p.t };
    this.raw.push(noisy);
    this.filtered.push(this.ensureFilter().apply(noisy));
    const cutoff = p.t - HISTORY_MS;
    while (this.raw.length && this.raw[0]!.t < cutoff) this.raw.shift();
    while (this.filtered.length && this.filtered[0]!.t < cutoff) this.filtered.shift();
    this.scheduleDraw();
    clearTimeout(this.summaryTimer);
    this.summaryTimer = setTimeout(() => this.summarize(), 600);
  }

  private summarize() {
    if (!this.opts.onSummary || this.raw.length < 10) return;
    const before = shakeEnergy(this.raw);
    const after = shakeEnergy(this.filtered);
    if (before <= 0) return;
    const pct = Math.round(Math.max(0, 1 - after / before) * 100);
    this.opts.onSummary(`With these settings, Steady removed about ${pct}% of the shake from that movement.`);
  }

  /** Plays a synthetic 4-second movement so the effect can be seen without using a mouse. */
  play(): Promise<void> {
    cancelAnimationFrame(this.playing);
    this.filter.reset();
    this.raw = [];
    this.filtered = [];
    const w = this.canvas.width;
    const h = this.canvas.height;
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = now - start;
        const u = Math.min(1, t / 4000);
        // Out-and-back sweep with a pause in the middle (where tremor is most visible).
        const phase = u < 0.4 ? u / 0.4 : u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
        const ease = 0.5 - 0.5 * Math.cos(Math.PI * phase);
        this.push({ x: w * (0.1 + 0.8 * ease), y: h * (0.5 + 0.25 * Math.sin(Math.PI * 2 * ease)), t: now });
        if (u < 1) this.playing = requestAnimationFrame(step);
        else {
          this.playing = 0;
          resolve();
        }
      };
      this.playing = requestAnimationFrame(step);
    });
  }

  private scheduleDraw() {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.draw());
  }

  private draw() {
    this.frame = 0;
    const { ctx, canvas } = this;
    const css = getComputedStyle(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = css.getPropertyValue('--surface').trim() || '#f3f5f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const line = (pts: PointerSample[], color: string, width: number) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    line(this.raw, css.getPropertyValue('--muted').trim() || '#777', 1.5);
    line(this.filtered, css.getPropertyValue('--accent').trim() || '#0b5d63', 4);
    if (!this.raw.length) {
      ctx.fillStyle = css.getPropertyValue('--muted').trim() || '#555';
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Move the pointer here', canvas.width / 2, canvas.height / 2);
    }
  }
}
