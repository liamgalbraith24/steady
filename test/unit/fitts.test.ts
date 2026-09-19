import { describe, expect, it } from 'vitest';
import {
  conditionThroughput,
  isoSequence,
  projectEndpoint,
  rawTlx,
  ringPositions,
  summarizeAll,
  summarizeBlock,
  susScore,
} from '../../src/demo/fittsMath';
import type { FittsTrial } from '../../src/demo/session';
import { seededRandom, shuffle } from '../../src/demo/session';

describe('ISO 9241-9 geometry', () => {
  it('places 13 targets on a circle', () => {
    const pts = ringPositions(13, 400, { x: 500, y: 500 });
    expect(pts).toHaveLength(13);
    expect(pts[0]!.x).toBeCloseTo(500);
    expect(pts[0]!.y).toBeCloseTo(300);
    for (const p of pts) expect(Math.hypot(p.x - 500, p.y - 500)).toBeCloseTo(200);
  });

  it('alternates across the circle', () => {
    expect(isoSequence(13, 14)).toEqual([0, 7, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 0]);
  });

  it('projects endpoints onto the task axis', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    expect(projectEndpoint(from, to, { x: 105, y: 30 }, null)).toEqual({ dx: 5, ae: 105 });
    expect(projectEndpoint(from, to, { x: 95, y: 0 }, { x: -3, y: 2 }).ae).toBe(98);
  });
});

function trial(over: Partial<FittsTrial>): FittsTrial {
  return {
    condition: 'steady', block: 0, widthPx: 40, amplitudePx: 420, trial: 0, from: 0, to: 7,
    movementMs: 1000, hit: true, endX: 0, endY: 0, dx: 0, ae: 420, input: 'pointer', tremorPx: 0, t: '', ...over,
  };
}

describe('throughput', () => {
  it('computes nominal and effective throughput', () => {
    const dxs = [-8, -4, 0, 4, 8, -6, 6, -2, 2, 0];
    const trials = dxs.map((dx, i) => trial({ dx, trial: i, hit: i !== 0 }));
    const b = summarizeBlock(trials)!;
    expect(b.idNominal).toBeCloseTo(Math.log2(420 / 40 + 1));
    expect(b.tpNominal).toBeCloseTo(b.idNominal / 1);
    expect(b.errorRate).toBeCloseTo(0.1);
    expect(b.weEffective).toBeCloseTo(4.133 * Math.sqrt(240 / 9), 5); // sample SD of the dx values
    expect(b.tpEffective).toBeGreaterThan(0);
  });

  it('keeps effective throughput finite when snapping removes all endpoint spread', () => {
    const b = summarizeBlock(Array.from({ length: 10 }, () => trial({ dx: 0 })))!;
    expect(b.weEffective).toBe(1);
    expect(Number.isFinite(b.tpEffective!)).toBe(true);
  });

  it('skips effective throughput for keyboard-only blocks', () => {
    const b = summarizeBlock(Array.from({ length: 10 }, () => trial({ dx: null, ae: null, input: 'keyboard' })))!;
    expect(b.tpEffective).toBeNull();
  });

  it('groups by condition and block and averages per condition', () => {
    const trials = [
      ...Array.from({ length: 5 }, () => trial({ widthPx: 24, movementMs: 2000 })),
      ...Array.from({ length: 5 }, () => trial({ widthPx: 64, movementMs: 500 })),
      ...Array.from({ length: 5 }, () => trial({ condition: 'baseline', movementMs: 3000, hit: false })),
    ];
    const blocks = summarizeAll(trials);
    expect(blocks).toHaveLength(3);
    const s = conditionThroughput(blocks, 'steady');
    expect(s.blocks).toBe(2);
    expect(conditionThroughput(blocks, 'baseline').errorRate).toBe(1);
  });
});

describe('questionnaires', () => {
  it('scores SUS', () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([3, 3])).toBeNaN();
  });

  it('scores raw TLX', () => {
    expect(rawTlx([10, 20, 30, 40, 50, 60])).toBe(35);
  });
});

describe('seeded order', () => {
  it('is reproducible per participant', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], seededRandom('P07'));
    const b = shuffle([1, 2, 3, 4, 5, 6], seededRandom('P07'));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
