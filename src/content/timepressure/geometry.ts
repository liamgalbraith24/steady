// Geometry for the hover-menu "triangle of intent": the region swept between the
// point where the cursor left the trigger and the menu. A cursor inside it is
// heading for the menu. We use the convex hull of {exit point, menu corners},
// which is the classic triangle generalised to any relative position.
import type { Rect } from '../overlay/overlay';

export interface Pt {
  x: number;
  y: number;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Andrew's monotone chain; returns the hull counter-clockwise without repeating the start. */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function pointInConvexPolygon(p: Pt, hull: Pt[], tolerance = 0): boolean {
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (cross(a, b, p) / len < -tolerance) return false;
  }
  return true;
}

export function rectCorners(r: Rect): Pt[] {
  return [
    { x: r.left, y: r.top },
    { x: r.left + r.width, y: r.top },
    { x: r.left, y: r.top + r.height },
    { x: r.left + r.width, y: r.top + r.height },
  ];
}

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const x of rects) {
    l = Math.min(l, x.left);
    t = Math.min(t, x.top);
    r = Math.max(r, x.left + x.width);
    b = Math.max(b, x.top + x.height);
  }
  return { left: l, top: t, width: r - l, height: b - t };
}

export function inRect(p: Pt, r: Rect, pad = 0): boolean {
  return p.x >= r.left - pad && p.x <= r.left + r.width + pad && p.y >= r.top - pad && p.y <= r.top + r.height + pad;
}

/** Is `p` in the triangle of intent from `exit` toward `menu` (or in the menu itself)? */
export function headingToward(p: Pt, exit: Pt, menu: Rect, tolerancePx = 6): boolean {
  if (inRect(p, menu, tolerancePx)) return true;
  return pointInConvexPolygon(p, convexHull([exit, ...rectCorners(menu)]), tolerancePx);
}
