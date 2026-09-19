import { describe, expect, it } from 'vitest';
import { HYSTERESIS_PX, SnapController, magnifyGrow, pickNearest, rectDistance } from '../../src/content/targets/snap';
import type { Candidate } from '../../src/content/targets/scanner';

const cand = (name: string, left: number, top: number, width: number, height: number): Candidate => ({
  el: { name } as unknown as Element,
  rect: { left, top, width, height },
  area: width * height,
});

describe('rectDistance', () => {
  const r = { left: 100, top: 100, width: 50, height: 20 };
  it('is 0 inside', () => expect(rectDistance(120, 110, r)).toBe(0));
  it('measures to the nearest edge', () => expect(rectDistance(90, 110, r)).toBe(10));
  it('measures to the nearest corner', () => expect(rectDistance(147 + 6, 124 + 0, r)).toBeCloseTo(5));
  it('grows the rect', () => expect(rectDistance(90, 110, r, 10)).toBe(0));
});

describe('pickNearest', () => {
  it('picks the closest within the radius', () => {
    const a = cand('a', 0, 0, 40, 40);
    const b = cand('b', 100, 0, 40, 40);
    expect(pickNearest(80, 20, [a, b], 50)?.cand).toBe(b);
    expect(pickNearest(80, 20, [a, b], 10)).toBeNull();
  });

  it('breaks ties with the smaller element', () => {
    const big = cand('big', 0, 0, 200, 200);
    const small = cand('small', 50, 50, 20, 20);
    expect(pickNearest(60, 60, [big, small], 40)?.cand).toBe(small);
  });
});

describe('SnapController', () => {
  // Two adjacent 80×40 buttons with a 4 px gap: A at x∈[0,80], B at x∈[84,164].
  const A = cand('A', 0, 0, 80, 40);
  const B = cand('B', 84, 0, 80, 40);
  const both = [A, B];

  it('captures a target up to the radius away', () => {
    const s = new SnapController();
    expect(s.update(40, 90, both, 60)).toBe(A); // 50 px below A
    expect(s.update(40, 150, both, 60)).toBeNull();
  });

  it('does not flicker between adjacent buttons (hysteresis)', () => {
    const s = new SnapController();
    s.update(70, 20, both, 40);
    expect(s.captured).toBe(A);
    // Jitter back and forth across the gap by a few px: capture must stay on A.
    for (const x of [82, 85, 81, 86, 83, 87, 80, 87.5]) expect(s.update(x, 20, both, 40)).toBe(A);
    // Well inside B, >= 8 px past A's edge: capture moves.
    expect(s.update(80 + HYSTERESIS_PX + 1, 20, both, 40)).toBe(B);
    // And now jitter near the gap keeps B.
    for (const x of [82, 79, 84, 77]) expect(s.update(x, 20, both, 40)).toBe(B);
  });

  it('switches immediately to a smaller target nested inside the captured one', () => {
    const card = cand('card', 0, 0, 300, 200);
    const btn = cand('btn', 200, 150, 60, 30);
    const s = new SnapController();
    expect(s.update(50, 50, [card, btn], 40)).toBe(card);
    expect(s.update(210, 160, [card, btn], 40)).toBe(btn);
  });

  it('releases when the target leaves the radius or disappears', () => {
    const s = new SnapController();
    s.update(40, 20, both, 30);
    expect(s.update(40, 100, both, 30)).toBeNull();
    s.update(40, 20, both, 30);
    expect(s.update(40, 20, [B], 30)).toBeNull(); // A removed, B is 44 px away
  });

  it('magnify keeps the captured target over a larger area', () => {
    const plain = new SnapController();
    const magnified = new SnapController();
    plain.update(40, 20, both, 0);
    magnified.update(40, 20, both, 0, 2);
    expect(magnifyGrow(A.rect, 2)).toBe(20);
    expect(plain.update(40, 55, both, 0)).toBeNull(); // 15 px below A
    expect(magnified.update(40, 55, both, 0, 2)).toBe(A);
  });
});
