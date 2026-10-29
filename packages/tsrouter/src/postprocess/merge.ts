import type { Point, Rect, RoutedPath } from "../types.js";
import { segmentIntersectsRect } from "../geometry/segment.js";
import { simplifyPath } from "./simplify.js";

/**
 * Pulls parallel stretches of bundled connections (sharing a group) onto one line: two paths of a
 * bundle running side by side - a gap apart - meet there instead of only further on. A stretch moves
 * onto its partner's line when nothing lies in the way and the pieces at the ports stay long enough.
 * The first and last stretch (at the ports) never move.
 */
export function mergeBundles(
  paths: RoutedPath[],
  obstacles: Rect[],
  maxGap: number,
  portStub: number,
  /** Zones, and per connection those it may enter - a moved stretch keeps out of all others */
  zones: { id: string; rect: Rect }[] = [],
  allowedZones: Map<string, string[]> = new Map()
): RoutedPath[] {
  const result = paths.map((p) => ({ ...p, points: p.points.map((pt) => ({ ...pt })) }));
  const shareGroup = (a: RoutedPath, b: RoutedPath) =>
    !!a.groups?.some((g) => b.groups?.includes(g));

  const vertical = (p: Point, q: Point) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) > 1e-6;
  const horizontal = (p: Point, q: Point) => Math.abs(p.y - q.y) < 1e-6 && Math.abs(p.x - q.x) > 1e-6;

  const holds = (r: Rect, p: Point) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  /** Segments from..to of a path miss every obstacle - the first one may touch its start node, the last its end node -
   * and every zone the path may not enter */
  const segmentsClear = (pts: Point[], from: number, to: number, connectionId?: string): boolean => {
    const n = pts.length;
    const allowed = connectionId ? allowedZones.get(connectionId) ?? [] : null;
    for (let k = from; k <= to; k++) {
      if (allowed) {
        for (const z of zones) {
          if (!allowed.includes(z.id) && segmentIntersectsRect(pts[k], pts[k + 1], z.rect)) return false;
        }
      }
      for (const r of obstacles) {
        if ((k === 0 && holds(r, pts[0])) || (k === n - 2 && holds(r, pts[n - 1]))) continue;
        if (segmentIntersectsRect(pts[k], pts[k + 1], r)) return false;
      }
    }
    return true;
  };

  /** Moves stretch si of path a onto the line `to`; false (and nothing changed) when it may not */
  const tryMove = (a: RoutedPath, si: number, isVertical: boolean, to: number): boolean => {
    const pts = a.points;
    const n = pts.length;
    if (si <= 0 || si >= n - 2) return false;
    const moved = pts.map((pt) => ({ ...pt }));
    for (const k of [si, si + 1]) {
      if (isVertical) moved[k].x = to;
      else moved[k].y = to;
    }
    // The pieces at the ports keep their length for an arrow head
    const first = Math.hypot(moved[1].x - moved[0].x, moved[1].y - moved[0].y);
    const last = Math.hypot(moved[n - 1].x - moved[n - 2].x, moved[n - 1].y - moved[n - 2].y);
    if (first < portStub || last < portStub) return false;
    // The pieces at the ports keep their direction - never back across their own node
    const sameWay = (k: number) =>
      Math.sign(moved[k + 1].x - moved[k].x) === Math.sign(pts[k + 1].x - pts[k].x) &&
      Math.sign(moved[k + 1].y - moved[k].y) === Math.sign(pts[k + 1].y - pts[k].y);
    if (!sameWay(0) || !sameWay(n - 2)) return false;
    // Nothing in the way of the moved stretch and the two next to it; only the pieces at the ports may
    // touch their own end node
    if (!segmentsClear(moved, Math.max(0, si - 1), Math.min(n - 2, si + 1), a.connectionId)) return false;
    a.points = moved;
    return true;
  };

  /**
   * Two of a bundle coming from both sides, each down its own vertical, meeting on one horizontal further
   * down (a T): the horizontal is lifted as high as both verticals reach - they meet right after leaving
   * their frames, the bundle goes on down from there. Only when nothing is in the way.
   */
  const near = (p: Point, q: Point) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
  const liftJoin = (a: RoutedPath, b: RoutedPath): boolean => {
    for (let ia = 2; ia < a.points.length; ia++) {
      const J = a.points[ia];
      const ib = b.points.findIndex((p, k) => k >= 2 && near(p, J));
      if (ib < 0) continue;
      const A1 = a.points[ia - 1], A0 = a.points[ia - 2];
      const B1 = b.points[ib - 1], B0 = b.points[ib - 2];
      // Horizontally into J from opposite sides, each after a vertical coming down
      if (!horizontal(A1, J) || !horizontal(B1, J) || Math.abs(A1.y - B1.y) > 1e-6) continue;
      if ((A1.x - J.x) * (B1.x - J.x) >= 0) continue;
      if (!vertical(A0, A1) || !vertical(B0, B1) || A0.y >= A1.y || B0.y >= B1.y) continue;
      // Not into the stretches at the ports
      if (ia - 2 < 1 || ib - 2 < 1) continue;
      const y = J.y;
      const lifted = Math.max(A0.y, B0.y) + 0.0001;
      if (lifted >= y - 1) continue;
      const top = Math.max(A0.y, B0.y);
      const newA = [...a.points.slice(0, ia - 1), { x: A0.x, y: top }, { x: J.x, y: top }, ...a.points.slice(ia)];
      const newB = [...b.points.slice(0, ib - 1), { x: B0.x, y: top }, { x: J.x, y: top }, ...b.points.slice(ib)];
      if (!segmentsClear(newA, Math.max(0, ia - 3), Math.min(newA.length - 2, ia + 1), a.connectionId)) continue;
      if (!segmentsClear(newB, Math.max(0, ib - 3), Math.min(newB.length - 2, ib + 1), b.connectionId)) continue;
      // Every path of the bundle on one of the two ways into J goes up with it
      const oldA = [A0, A1, J].map((p) => ({ ...p }));
      const oldB = [B0, B1, J].map((p) => ({ ...p }));
      for (const c of result) {
        for (const [o0, o1, oj] of [oldA, oldB]) {
          const k = c.points.findIndex((p, m) => m >= 1 && near(p, o1) && near(c.points[m + 1] ?? p, oj) && near(c.points[m - 1], o0));
          if (k < 0) continue;
          const pts = [...c.points.slice(0, k), { x: o0.x, y: top }, { x: oj.x, y: top }, ...c.points.slice(k + 1)];
          c.points = simplifyPath(pts.filter((p, m, arr) => m === 0 || !near(p, arr[m - 1])));
        }
      }
      return true;
    }
    return false;
  };

  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result.length; j++) {
        if (i === j || !shareGroup(result[i], result[j])) continue;
        const a = result[i];
        const b = result[j];
        for (let si = 1; si < a.points.length - 2; si++) {
          const p1 = a.points[si];
          const p2 = a.points[si + 1];
          const isVertical = vertical(p1, p2);
          if (!isVertical && !horizontal(p1, p2)) continue;
          for (let sj = 0; sj < b.points.length - 1; sj++) {
            const q1 = b.points[sj];
            const q2 = b.points[sj + 1];
            if (isVertical ? !vertical(q1, q2) : !horizontal(q1, q2)) continue;
            const fa = isVertical ? p1.x : p1.y;
            const fb = isVertical ? q1.x : q1.y;
            const gap = Math.abs(fa - fb);
            if (gap < 0.5 || gap > maxGap) continue;
            // Side by side: their ranges overlap
            const [a0, a1] = isVertical ? [Math.min(p1.y, p2.y), Math.max(p1.y, p2.y)] : [Math.min(p1.x, p2.x), Math.max(p1.x, p2.x)];
            const [b0, b1] = isVertical ? [Math.min(q1.y, q2.y), Math.max(q1.y, q2.y)] : [Math.min(q1.x, q2.x), Math.max(q1.x, q2.x)];
            if (a0 >= b1 || b0 >= a1) continue;
            if (tryMove(a, si, isVertical, fb)) {
              a.points = simplifyPath(a.points);
              changed = true;
              break;
            }
          }
          if (changed) break;
        }
      }
    }
    if (!changed) break;
  }
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (let i = 0; i < result.length && !changed; i++) {
      for (let j = i + 1; j < result.length && !changed; j++) {
        if (shareGroup(result[i], result[j]) && liftJoin(result[i], result[j])) changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}
