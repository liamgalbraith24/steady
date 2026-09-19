// ISO 9241-9 multidirectional tapping: geometry and throughput
// (Soukoreff & MacKenzie, IJHCS 2004).
import type { Condition, FittsTrial } from './session';

export const TARGET_COUNT = 13;
export const WIDTHS = [24, 40, 64] as const;
export const AMPLITUDES = [240, 420] as const;
export const TRIALS_PER_BLOCK = 15;

export interface Pt {
  x: number;
  y: number;
}

/** Centres of n targets evenly spaced on a circle of diameter `amplitude`, starting at the top. */
export function ringPositions(n: number, amplitude: number, centre: Pt): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: centre.x + (amplitude / 2) * Math.cos(a), y: centre.y + (amplitude / 2) * Math.sin(a) };
  });
}

/** ISO selection order: each target is (nearly) opposite the previous one: 0, 7, 1, 8, 2, … */
export function isoSequence(n: number, length: number): number[] {
  const step = Math.ceil(n / 2);
  return Array.from({ length }, (_, k) => (k * step) % n);
}

/** Signed projection of (end − to) onto the from→to axis, and movement distance along it. */
export function projectEndpoint(from: Pt, to: Pt, end: Pt, prevEnd: Pt | null) {
  const ax = to.x - from.x;
  const ay = to.y - from.y;
  const len = Math.hypot(ax, ay) || 1;
  const dx = ((end.x - to.x) * ax + (end.y - to.y) * ay) / len;
  const start = prevEnd ?? from;
  const ae = ((end.x - start.x) * ax + (end.y - start.y) * ay) / len;
  return { dx, ae };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

export interface BlockSummary {
  condition: Condition;
  widthPx: number;
  amplitudePx: number;
  trials: number;
  errorRate: number;
  meanMtMs: number;
  idNominal: number;
  /** Nominal throughput (bits/s): ID / MT. Robust when snapping collapses endpoint spread. */
  tpNominal: number;
  weEffective: number | null;
  idEffective: number | null;
  /** Effective throughput (bits/s), ISO 9241-9. Null without enough pointer endpoints. */
  tpEffective: number | null;
}

export function summarizeBlock(trials: FittsTrial[]): BlockSummary | null {
  if (!trials.length) return null;
  const { condition, widthPx: W, amplitudePx: A } = trials[0]!;
  const mt = mean(trials.map((t) => t.movementMs)) / 1000;
  const idNominal = Math.log2(A / W + 1);
  const withEnd = trials.filter((t) => t.dx !== null && t.ae !== null);
  let weEffective: number | null = null;
  let idEffective: number | null = null;
  let tpEffective: number | null = null;
  if (withEnd.length >= 5) {
    const s = sd(withEnd.map((t) => t.dx!));
    // With perfect snapping every endpoint is the target centre (SD → 0). Floor We at
    // 1 px so throughput stays finite; tpNominal is the better comparison in that case.
    weEffective = Math.max(1, 4.133 * s);
    const ae = mean(withEnd.map((t) => t.ae!));
    idEffective = Math.log2(ae / weEffective + 1);
    tpEffective = idEffective / mt;
  }
  return {
    condition,
    widthPx: W,
    amplitudePx: A,
    trials: trials.length,
    errorRate: trials.filter((t) => !t.hit).length / trials.length,
    meanMtMs: mt * 1000,
    idNominal,
    tpNominal: idNominal / mt,
    weEffective,
    idEffective,
    tpEffective,
  };
}

export function summarizeAll(trials: FittsTrial[]): BlockSummary[] {
  const groups = new Map<string, FittsTrial[]>();
  for (const t of trials) {
    const k = `${t.condition}|${t.widthPx}|${t.amplitudePx}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.values()].map(summarizeBlock).filter((b): b is BlockSummary => !!b);
}

/** Per-condition throughput = mean of the block throughputs (ISO 9241-9 practice). */
export function conditionThroughput(blocks: BlockSummary[], condition: Condition) {
  const bs = blocks.filter((b) => b.condition === condition);
  const eff = bs.map((b) => b.tpEffective).filter((x): x is number => x !== null);
  return {
    blocks: bs.length,
    tpNominal: mean(bs.map((b) => b.tpNominal)),
    tpEffective: eff.length ? mean(eff) : null,
    errorRate: mean(bs.map((b) => b.errorRate)),
  };
}

// --- Questionnaires -------------------------------------------------------------

/** SUS (Brooke 1996): odd items positive, even items negative; 0–100. */
export function susScore(answers: number[]): number {
  if (answers.length !== 10 || answers.some((a) => a < 1 || a > 5)) return NaN;
  const sum = answers.reduce((acc, a, i) => acc + (i % 2 === 0 ? a - 1 : 5 - a), 0);
  return sum * 2.5;
}

/** Raw (unweighted) NASA-TLX: mean of the six 0–100 subscales. */
export function rawTlx(values: number[]): number {
  return values.length === 6 ? mean(values) : NaN;
}
