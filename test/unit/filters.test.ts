import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from '../../src/content/filters/OneEuroFilter';
import { ExponentialFilter } from '../../src/content/filters/ExponentialFilter';
import { NoFilter, createFilter, type Filter } from '../../src/content/filters/Filter';
import type { PointerSample } from '../../src/content/input/InputSource';
import { defaultProfiles } from '../../src/shared/settings';

const HZ = 120;
const SWEEP_MS = 2000;
const HOLD_MS = 1500;
const END_X = 600;

/** Linear sweep 0→600 px over 2 s, then hold, plus a 5 Hz / 8 px sine tremor on both axes. */
function tremorSignal(): { clean: PointerSample[]; noisy: PointerSample[] } {
  const clean: PointerSample[] = [];
  const noisy: PointerSample[] = [];
  for (let i = 0; i <= ((SWEEP_MS + HOLD_MS) / 1000) * HZ; i++) {
    const t = (i * 1000) / HZ;
    const x = Math.min(1, t / SWEEP_MS) * END_X;
    const y = 300;
    const w = 2 * Math.PI * 5 * (t / 1000);
    clean.push({ x, y, t });
    noisy.push({ x: x + 8 * Math.sin(w), y: y + 8 * Math.sin(w + 0.7), t });
  }
  return { clean, noisy };
}

/** Energy of what remains after removing a 200 ms moving average (one tremor period). */
function highFrequencyEnergy(path: PointerSample[]): number {
  const win = Math.round(0.2 * HZ);
  let e = 0;
  for (let i = win; i < path.length - win; i++) {
    let mx = 0;
    let my = 0;
    for (let j = i - win / 2; j < i + win / 2; j++) {
      mx += path[j]!.x;
      my += path[j]!.y;
    }
    e += (path[i]!.x - mx / win) ** 2 + (path[i]!.y - my / win) ** 2;
  }
  return e;
}

const run = (f: Filter, path: PointerSample[]) => path.map((s) => f.apply(s));

function endpointError(path: PointerSample[]): number {
  const tail = path.filter((s) => s.t >= SWEEP_MS + HOLD_MS - 500);
  const mx = tail.reduce((a, s) => a + s.x, 0) / tail.length;
  const my = tail.reduce((a, s) => a + s.y, 0) / tail.length;
  return Math.hypot(mx - END_X, my - 300);
}

describe('OneEuroFilter', () => {
  const { noisy } = tremorSignal();
  const raw = highFrequencyEnergy(noisy);

  it.each(defaultProfiles().map((p) => [p.name, p.filter] as const))('%s smooths a 5 Hz tremor', (_name, cfg) => {
    const out = run(createFilter(cfg), noisy);
    const ratio = highFrequencyEnergy(out) / raw;
    expect(ratio).toBeLessThan(0.35);
    expect(endpointError(out)).toBeLessThan(3);
  });

  it('strong settings attenuate more than mild', () => {
    const [mild, strong] = defaultProfiles();
    const eMild = highFrequencyEnergy(run(createFilter(mild!.filter), noisy));
    const eStrong = highFrequencyEnergy(run(createFilter(strong!.filter), noisy));
    expect(eStrong).toBeLessThan(eMild);
  });

  it('passes the first sample through unchanged and ignores duplicate timestamps', () => {
    const f = new OneEuroFilter(1, 0.01);
    expect(f.apply({ x: 10, y: 20, t: 0 })).toEqual({ x: 10, y: 20, t: 0 });
    const a = f.apply({ x: 50, y: 20, t: 16 });
    expect(f.apply({ x: 900, y: 900, t: 16 })).toEqual(a);
  });

  it('converges to a stationary target', () => {
    const f = new OneEuroFilter(0.4, 0.002);
    f.apply({ x: 0, y: 0, t: 0 });
    let out = { x: 0, y: 0, t: 0 };
    for (let t = 8; t < 4000; t += 8) out = f.apply({ x: 100, y: 50, t });
    expect(Math.hypot(out.x - 100, out.y - 50)).toBeLessThan(0.5);
  });

  it('reset() forgets history', () => {
    const f = new OneEuroFilter(1, 0.01);
    f.apply({ x: 0, y: 0, t: 0 });
    f.apply({ x: 10, y: 10, t: 16 });
    f.reset();
    expect(f.apply({ x: 500, y: 500, t: 32 })).toEqual({ x: 500, y: 500, t: 32 });
  });
});

describe('ExponentialFilter', () => {
  it('smooths the tremor and reaches the endpoint', () => {
    const { noisy } = tremorSignal();
    const out = run(new ExponentialFilter(0.08), noisy);
    expect(highFrequencyEnergy(out) / highFrequencyEnergy(noisy)).toBeLessThan(0.35);
    expect(endpointError(out)).toBeLessThan(3);
  });

  it('lags more than 1€ during fast movement at similar smoothing (why 1€ is the default)', () => {
    const { clean } = tremorSignal();
    const lagAtMidSweep = (f: Filter) => {
      const out = run(f, clean);
      const i = out.findIndex((s) => s.t >= SWEEP_MS / 2);
      return clean[i]!.x - out[i]!.x;
    };
    expect(lagAtMidSweep(new OneEuroFilter(0.4, 0.002))).toBeLessThan(lagAtMidSweep(new ExponentialFilter(0.02)));
  });
});

describe('NoFilter', () => {
  it('is the identity', () => {
    const s = { x: 1, y: 2, t: 3 };
    expect(new NoFilter().apply(s)).toBe(s);
  });
});
