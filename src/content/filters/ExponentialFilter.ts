// Single exponential smoothing: the simplest low-pass filter, kept as a baseline
// to compare against the 1€ filter. Fixed alpha means a fixed lag/jitter trade-off.
import type { Filter } from './Filter';
import type { PointerSample } from '../input/InputSource';

export class ExponentialFilter implements Filter {
  private last: PointerSample | null = null;

  constructor(private readonly alpha: number) {}

  reset() {
    this.last = null;
  }

  apply(s: PointerSample): PointerSample {
    if (!this.last) {
      this.last = s;
      return s;
    }
    const a = this.alpha;
    this.last = { x: this.last.x + a * (s.x - this.last.x), y: this.last.y + a * (s.y - this.last.y), t: s.t };
    return this.last;
  }
}
