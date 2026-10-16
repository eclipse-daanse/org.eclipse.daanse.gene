import type { Point, Rect } from "../types.js";
import { rectCorners } from "../geometry/rect.js";

/** Collect all unique x and y coordinates from expanded obstacle corners and port positions */
export function collectCoordinates(
  expandedRects: Rect[],
  portPoints: Point[]
): { xs: number[]; ys: number[] } {
  const xSet = new Set<number>();
  const ySet = new Set<number>();

  for (const rect of expandedRects) {
    for (const corner of rectCorners(rect)) {
      xSet.add(corner.x);
      ySet.add(corner.y);
    }
  }

  for (const p of portPoints) {
    xSet.add(p.x);
    ySet.add(p.y);
  }

  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);
  return { xs, ys };
}
