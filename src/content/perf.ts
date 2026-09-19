// Tiny main-thread cost tracker (spec: < 1 ms per pointer sample). Keeps the last
// 512 durations so p95 reflects current behaviour.
export class PerfStats {
  private readonly buf = new Float64Array(512);
  private n = 0;
  count = 0;
  max = 0;

  add(ms: number) {
    this.buf[this.n++ % this.buf.length] = ms;
    this.count++;
    if (ms > this.max) this.max = ms;
  }

  /** Measures fn() and returns its result. */
  time<T>(fn: () => T): T {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      this.add(performance.now() - t0);
    }
  }

  summary() {
    const k = Math.min(this.n, this.buf.length);
    const sorted = Array.from(this.buf.subarray(0, k)).sort((a, b) => a - b);
    const mean = k ? sorted.reduce((a, b) => a + b, 0) / k : 0;
    const p95 = k ? sorted[Math.min(k - 1, Math.floor(k * 0.95))]! : 0;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return { count: this.count, meanMs: r(mean), p95Ms: r(p95), maxMs: r(this.max) };
  }
}
