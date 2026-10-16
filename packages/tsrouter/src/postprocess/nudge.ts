import type { Point, RoutedPath } from "../types.js";
import { segmentOrientation } from "../geometry/segment.js";

interface Segment {
  pathIndex: number;
  segIndex: number;
  orientation: "horizontal" | "vertical";
  fixedCoord: number;
  minVar: number;
  maxVar: number;
}

/** Nudge overlapping parallel segments apart by nudgeDistance, respecting lineMargin */
export function nudgePaths(
  paths: RoutedPath[],
  nudgeDistance: number,
  lineMargin: number
): RoutedPath[] {
  const segments = collectSegments(paths);
  const groups = groupOverlappingSegments(segments);
  const result = paths.map((p) => ({
    ...p,
    points: p.points.map((pt) => ({ ...pt })),
  }));

  for (const group of groups) {
    if (group.length <= 1) continue;

    const orientation = group[0].orientation;
    const spacing = Math.max(nudgeDistance, lineMargin);

    // Center the group
    const totalWidth = (group.length - 1) * spacing;
    const center =
      group.reduce((sum, s) => sum + s.fixedCoord, 0) / group.length;
    const startOffset = center - totalWidth / 2;

    // Sort by original fixed coordinate for stable ordering
    group.sort((a, b) => a.fixedCoord - b.fixedCoord);

    for (let i = 0; i < group.length; i++) {
      const seg = group[i];
      const newFixed = startOffset + i * spacing;
      const delta = newFixed - seg.fixedCoord;

      if (Math.abs(delta) < 1e-9) continue;

      const pathPoints = result[seg.pathIndex].points;
      const p1 = pathPoints[seg.segIndex];
      const p2 = pathPoints[seg.segIndex + 1];

      if (orientation === "horizontal") {
        p1.y += delta;
        p2.y += delta;
      } else {
        p1.x += delta;
        p2.x += delta;
      }
    }
  }

  return result;
}

function collectSegments(paths: RoutedPath[]): Segment[] {
  const segments: Segment[] = [];
  for (let pi = 0; pi < paths.length; pi++) {
    const pts = paths[pi].points;
    for (let si = 0; si < pts.length - 1; si++) {
      const orient = segmentOrientation(pts[si], pts[si + 1]);
      if (!orient) continue;

      if (orient === "horizontal") {
        segments.push({
          pathIndex: pi,
          segIndex: si,
          orientation: orient,
          fixedCoord: pts[si].y,
          minVar: Math.min(pts[si].x, pts[si + 1].x),
          maxVar: Math.max(pts[si].x, pts[si + 1].x),
        });
      } else {
        segments.push({
          pathIndex: pi,
          segIndex: si,
          orientation: orient,
          fixedCoord: pts[si].x,
          minVar: Math.min(pts[si].y, pts[si + 1].y),
          maxVar: Math.max(pts[si].y, pts[si + 1].y),
        });
      }
    }
  }
  return segments;
}

function groupOverlappingSegments(segments: Segment[]): Segment[][] {
  const groups: Segment[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const group = [segments[i]];
    used.add(i);

    for (let j = i + 1; j < segments.length; j++) {
      if (used.has(j)) continue;
      if (segmentsAreParallelAndOverlapping(segments[i], segments[j])) {
        group.push(segments[j]);
        used.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

function segmentsAreParallelAndOverlapping(a: Segment, b: Segment): boolean {
  if (a.orientation !== b.orientation) return false;
  // Close enough in the fixed coordinate
  if (Math.abs(a.fixedCoord - b.fixedCoord) > 1e-9) return false;
  // Overlapping range in the variable coordinate
  return a.minVar < b.maxVar && b.minVar < a.maxVar;
}
