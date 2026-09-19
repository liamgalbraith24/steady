// Bubble-cursor style target capture (Grossman & Balakrishnan, CHI 2005): the
// captured target is the one whose bounding box is nearest the cursor, within a
// radius. Ties go to the smaller (harder to hit) element. Hysteresis stops the
// capture flickering between neighbours.
import type { Rect } from '../overlay/overlay';
import type { Candidate } from './scanner';

export const HYSTERESIS_PX = 8;
const TIE_PX = 0.5;

/** Distance from a point to a rectangle (0 when inside). */
export function rectDistance(x: number, y: number, r: Rect, grow = 0): number {
  const dx = Math.max(r.left - grow - x, 0, x - (r.left + r.width + grow));
  const dy = Math.max(r.top - grow - y, 0, y - (r.top + r.height + grow));
  return Math.hypot(dx, dy);
}

export interface Pick {
  cand: Candidate;
  dist: number;
}

export function pickNearest(x: number, y: number, cands: readonly Candidate[], radius: number): Pick | null {
  let best: Pick | null = null;
  for (const cand of cands) {
    const dist = rectDistance(x, y, cand.rect);
    if (dist > radius) continue;
    if (!best || dist < best.dist - TIE_PX || (Math.abs(dist - best.dist) <= TIE_PX && cand.area < best.cand.area)) {
      best = { cand, dist };
    }
  }
  return best;
}

/** How much the captured target's catch area grows when "magnify" is on. */
export function magnifyGrow(r: Rect, scale: number): number {
  return scale > 1 ? ((scale - 1) * Math.min(r.width, r.height)) / 2 : 0;
}

export class SnapController {
  private current: Candidate | null = null;

  constructor(private readonly hysteresisPx = HYSTERESIS_PX) {}

  get captured(): Candidate | null {
    return this.current;
  }

  reset() {
    this.current = null;
  }

  /**
   * @param cands candidates near the cursor (fresh rects)
   * @param magnifyScale grows the *captured* target's catch area (1 = off)
   * @returns the captured candidate (or null)
   */
  update(x: number, y: number, cands: readonly Candidate[], radius: number, magnifyScale = 1): Candidate | null {
    const best = pickNearest(x, y, cands, radius);
    const cur = this.current && cands.find((c) => c.el === this.current!.el);
    if (!cur) {
      this.current = best?.cand ?? null;
      return this.current;
    }
    const grow = magnifyGrow(cur.rect, magnifyScale);
    const curDist = rectDistance(x, y, cur.rect, grow);
    if (curDist > radius + grow) {
      this.current = best?.cand ?? null;
      return this.current;
    }
    this.current = cur; // keep, with its fresh rect
    if (!best || best.cand.el === cur.el) return cur;
    const clearlyCloser = best.dist + this.hysteresisPx <= curDist;
    // Cursor is inside a smaller target nested in (or overlapping) the captured one.
    const nestedInside = best.dist === 0 && curDist === 0 && best.cand.area < cur.area;
    if (clearlyCloser || nestedInside) this.current = best.cand;
    return this.current;
  }
}
