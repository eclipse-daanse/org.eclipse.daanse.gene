import type { Point } from "../types.js";

/** Remove redundant collinear waypoints */
export function simplifyPath(points: Point[]): Point[] {
  if (points.length <= 2) return [...points];

  const result: Point[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const sameX = Math.abs(prev.x - curr.x) < 1e-9 && Math.abs(curr.x - next.x) < 1e-9;
    const sameY = Math.abs(prev.y - curr.y) < 1e-9 && Math.abs(curr.y - next.y) < 1e-9;

    if (!sameX && !sameY) {
      result.push(curr);
    }
  }

  result.push(points[points.length - 1]);
  return result;
}
