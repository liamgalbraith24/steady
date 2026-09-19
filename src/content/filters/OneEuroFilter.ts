// 1€ filter: Casiez, Roussel & Vogel, "1€ Filter: A Simple Speed-based Low-pass
// Filter for Noisy Input", CHI 2012. An adaptive low-pass filter whose cutoff
// rises with speed: heavy smoothing when the hand is (trying to be) still, low lag
// when it moves deliberately. Applied independently to x and y.
import type { Filter } from './Filter';
import type { PointerSample } from '../input/InputSource';

const smoothingFactor = (dtSeconds: number, cutoffHz: number) => {
  const r = 2 * Math.PI * cutoffHz * dtSeconds;
  return r / (r + 1);
};

class Axis {
  private x: number | null = null;
  private dx = 0;

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff: number,
  ) {}

  reset() {
    this.x = null;
    this.dx = 0;
  }

  apply(value: number, dt: number): number {
    if (this.x === null) {
      this.x = value;
      return value;
    }
    const rawDx = (value - this.x) / dt;
    this.dx += smoothingFactor(dt, this.dCutoff) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += smoothingFactor(dt, cutoff) * (value - this.x);
    return this.x;
  }
}

export class OneEuroFilter implements Filter {
  private readonly ax: Axis;
  private readonly ay: Axis;
  private lastT: number | null = null;
  private last: PointerSample | null = null;

  /**
   * @param minCutoff Hz; the cutoff when stationary.
   * @param beta Speed coefficient (per px/s).
   * @param dCutoff Hz; cutoff for the derivative estimate.
   */
  constructor(minCutoff: number, beta: number, dCutoff = 1) {
    this.ax = new Axis(minCutoff, beta, dCutoff);
    this.ay = new Axis(minCutoff, beta, dCutoff);
  }

  reset() {
    this.ax.reset();
    this.ay.reset();
    this.lastT = null;
    this.last = null;
  }

  apply(s: PointerSample): PointerSample {
    if (this.lastT !== null && this.last && s.t <= this.lastT) return this.last; // duplicate/out-of-order
    // Clamp dt: after a long pause (e.g. pointer left the window) don't let one huge
    // dt pass the jump through unfiltered; after tiny dt avoid divide blow-ups.
    const dt = this.lastT === null ? 1 / 60 : Math.min(0.1, Math.max(0.001, (s.t - this.lastT) / 1000));
    this.lastT = s.t;
    this.last = { x: this.ax.apply(s.x, dt), y: this.ay.apply(s.y, dt), t: s.t };
    return this.last;
  }
}
