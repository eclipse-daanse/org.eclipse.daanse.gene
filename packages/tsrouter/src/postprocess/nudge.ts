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
  // Parallel segments closer than the spacing count as on one line too - they are moved apart to it
  const groups = groupOverlappingSegments(segments, Math.max(nudgeDistance, lineMargin));
  const result = paths.map((p) => ({
    ...p,
    points: p.points.map((pt) => ({ ...pt })),
  }));

  for (const group of groups) {
    if (group.length <= 1) continue;

    const orientation = group[0].orientation;
    const spacing = Math.max(nudgeDistance, lineMargin);

    // Lanes: segments on the same line whose connections share a bundle stay together (merged), the others apart
    const laneList: Segment[][] = [];
    for (const seg of group) {
      const own = paths[seg.pathIndex].groups ?? [];
      const lane = laneList.find((l) =>
        l[0].fixedCoord === seg.fixedCoord &&
        l.some((o) => (paths[o.pathIndex].groups ?? []).some((g) => own.includes(g)))
      );
      if (lane) lane.push(seg);
      else laneList.push([seg]);
    }
    if (laneList.length <= 1) continue;

    // Center the lanes
    const totalWidth = (laneList.length - 1) * spacing;
    const center =
      laneList.reduce((sum, l) => sum + l[0].fixedCoord, 0) / laneList.length;
    const startOffset = center - totalWidth / 2;

    // Sort by original fixed coordinate for stable ordering
    laneList.sort((a, b) => a[0].fixedCoord - b[0].fixedCoord);

    for (let i = 0; i < laneList.length; i++) {
      const newFixed = startOffset + i * spacing;
      for (const seg of laneList[i]) {
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

function groupOverlappingSegments(segments: Segment[], near: number): Segment[][] {
  const groups: Segment[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const group = [segments[i]];
    used.add(i);

    for (let j = i + 1; j < segments.length; j++) {
      if (used.has(j)) continue;
      if (segmentsAreParallelAndOverlapping(segments[i], segments[j], near)) {
        group.push(segments[j]);
        used.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

function segmentsAreParallelAndOverlapping(a: Segment, b: Segment, near = 0): boolean {
  if (a.orientation !== b.orientation) return false;
  // Close enough in the fixed coordinate: on one line, or nearer than the spacing
  if (Math.abs(a.fixedCoord - b.fixedCoord) > Math.max(1e-9, near - 1e-6)) return false;
  // Overlapping range in the variable coordinate
  return a.minVar < b.maxVar && b.minVar < a.maxVar;
}
