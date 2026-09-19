// Dwell click state machine. Pure: time comes in with every update, so it is
// fully unit-testable and advances on either pointer samples or animation frames.
//
//   idle ──target captured──▶ dwelling ──held within R for dwellMs──▶ fired
//     ▲                          │  └─ drift > R: restart timer from the new point
//     │                          ├─ target changes: restart on the new target (or idle)
//     │                          └─ Esc: cancelled
//     └─ fired / cancelled re-arm when the target changes or the cursor moves > R
//
//   Rest zones (Midas touch, Jacob 1990): still on a *non-target* area for > 2×dwellMs
//   → resting. Nothing fires until the cursor moves ≥ R from where it came to rest.

export interface DwellConfig {
  dwellMs: number;
  restZoneEnabled: boolean;
  restZoneRadiusPx: number;
}

export type DwellState = 'idle' | 'dwelling' | 'fired' | 'cancelled' | 'resting';

export type DwellEvent<T> =
  | { type: 'fire'; target: T }
  | { type: 'cancel'; target: T; progress: number; reason: 'moved' | 'escape' }
  | { type: 'restStart' }
  | { type: 'restEnd' };

interface Pt {
  x: number;
  y: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export class DwellController<T> {
  private _state: DwellState = 'idle';
  private target: T | null = null;
  private entry: Pt = { x: 0, y: 0 };
  private start = 0;
  private lastT = 0;
  /** Where the cursor has been still since (for rest detection), and since when. */
  private still: (Pt & { t: number }) | null = null;
  private restAnchor: Pt | null = null;

  constructor(private cfg: DwellConfig) {}

  configure(cfg: DwellConfig) {
    this.cfg = cfg;
  }

  get state(): DwellState {
    return this._state;
  }

  get progress(): number {
    if (this._state !== 'dwelling') return 0;
    return Math.min(1, Math.max(0, (this.lastT - this.start) / this.cfg.dwellMs));
  }

  reset() {
    this._state = 'idle';
    this.target = null;
    this.still = null;
    this.restAnchor = null;
  }

  /** Esc: abandon the current dwell. It re-arms after the cursor moves or the target changes. */
  cancel(): DwellEvent<T> | null {
    if (this._state !== 'dwelling' || this.target === null) return null;
    const progress = this.progress;
    this._state = 'cancelled';
    return { type: 'cancel', target: this.target, progress, reason: 'escape' };
  }

  /** The target was just activated some other way (a physical click): do not dwell-click it too. */
  acknowledge() {
    if (this._state === 'dwelling') this._state = 'fired';
  }

  update(p: Pt, target: T | null, t: number): DwellEvent<T> | null {
    this.lastT = t;
    const R = this.cfg.restZoneRadiusPx;

    // Stillness tracking (reset on movement beyond R or on any target change).
    if (!this.still || dist(p, this.still) > R || target !== this.target) this.still = { x: p.x, y: p.y, t };

    if (this._state === 'resting') {
      if (dist(p, this.restAnchor!) < R) return null;
      this._state = 'idle';
      this.restAnchor = null;
      this.target = null; // force a fresh start below
      this.still = { x: p.x, y: p.y, t };
      this.begin(p, target, t);
      return { type: 'restEnd' };
    }

    if (target !== this.target) {
      const prev = this.target;
      const wasDwelling = this._state === 'dwelling' && prev !== null;
      const progress = this.progress;
      this.begin(p, target, t);
      if (wasDwelling && progress > 0) return { type: 'cancel', target: prev, progress, reason: 'moved' };
      return null;
    }

    if (target === null) {
      if (this.cfg.restZoneEnabled && this.still && t - this.still.t > 2 * this.cfg.dwellMs) {
        this._state = 'resting';
        this.restAnchor = { x: this.still.x, y: this.still.y };
        return { type: 'restStart' };
      }
      return null;
    }

    if (this._state === 'fired' || this._state === 'cancelled') {
      if (dist(p, this.entry) > R) this.arm(p, t); // moved away and back: allow another dwell
      return null;
    }

    // dwelling
    if (dist(p, this.entry) > R) {
      this.arm(p, t); // drifted: restart the countdown from here
      return null;
    }
    if (t - this.start >= this.cfg.dwellMs) {
      this._state = 'fired';
      this.entry = { x: p.x, y: p.y };
      return { type: 'fire', target };
    }
    return null;
  }

  private begin(p: Pt, target: T | null, t: number) {
    this.target = target;
    if (target === null) this._state = 'idle';
    else this.arm(p, t);
  }

  private arm(p: Pt, t: number) {
    this._state = 'dwelling';
    this.entry = { x: p.x, y: p.y };
    this.start = t;
  }
}
