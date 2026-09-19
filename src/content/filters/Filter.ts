import type { PointerSample } from '../input/InputSource';
import type { FilterConfig } from '../../shared/settings';
import { OneEuroFilter } from './OneEuroFilter';
import { ExponentialFilter } from './ExponentialFilter';

export interface Filter {
  reset(): void;
  apply(sample: PointerSample): PointerSample;
}

export class NoFilter implements Filter {
  reset() {}
  apply(s: PointerSample) {
    return s;
  }
}

export function createFilter(cfg: FilterConfig): Filter {
  switch (cfg.type) {
    case 'oneEuro':
      return new OneEuroFilter(cfg.minCutoff, cfg.beta);
    case 'exponential':
      return new ExponentialFilter(cfg.alpha ?? 0.3);
    default:
      return new NoFilter();
  }
}
