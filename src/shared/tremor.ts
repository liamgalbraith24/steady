// Synthetic tremor used by tests, the options trace canvas, and the demo page.
// Parkinsonian rest tremor is typically 4–6 Hz; we default to 5 Hz. A second, smaller
// incommensurate component keeps the path from looking like a perfect sine.
export interface TremorParams {
  amplitudePx: number;
  frequencyHz: number;
}

export function tremorOffset(tMs: number, p: TremorParams): { dx: number; dy: number } {
  const t = tMs / 1000;
  const w = 2 * Math.PI * p.frequencyHz;
  return {
    dx: p.amplitudePx * (Math.sin(w * t) + 0.25 * Math.sin(w * 1.7 * t + 1.3)) / 1.25,
    dy: p.amplitudePx * (Math.cos(w * t * 0.93 + 0.4) + 0.25 * Math.sin(w * 2.3 * t)) / 1.25,
  };
}
