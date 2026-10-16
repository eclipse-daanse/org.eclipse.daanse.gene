import type { Point, Rect } from "../types.js";
import type { AStarGraph, GraphEdge, CardinalDirection } from "../pathfinding/astar.js";
import { rectContains } from "../geometry/rect.js";
import { segmentIntersectsRect } from "../geometry/segment.js";
import { pointEquals } from "../geometry/point.js";
import { collectCoordinates } from "./scan-line.js";

export interface VisibilityGraph extends AStarGraph {
  points: Point[];
  findIndex(p: Point): number;
  addPoint(p: Point): number;
}

interface Edge {
  to: number;
  direction: CardinalDirection;
  cost: number;
}

export function buildVisibilityGraph(
  expandedRects: Rect[],
  portPoints: Point[]
): VisibilityGraph {
  const { xs, ys } = collectCoordinates(expandedRects, portPoints);
  const points: Point[] = [];
  const adjacency: Edge[][] = [];

  // Generate candidate points from grid intersections
  for (const x of xs) {
    for (const y of ys) {
      const p: Point = { x, y };
      if (!isInsideAnyRect(p, expandedRects)) {
        addPointInternal(p);
      }
    }
  }

  // Ensure all port points are in the graph
  for (const pp of portPoints) {
    ensurePoint(pp);
  }

  // Build edges: connect each point to its nearest visible neighbor in each cardinal direction
  buildEdges();

  function addPointInternal(p: Point): number {
    const idx = points.length;
    points.push(p);
    adjacency.push([]);
    return idx;
  }

  function ensurePoint(p: Point): number {
    const existing = points.findIndex((q) => pointEquals(p, q));
    if (existing >= 0) return existing;
    return addPointInternal(p);
  }

  function isInsideAnyRect(p: Point, rects: Rect[]): boolean {
    return rects.some((r) => rectContains(r, p));
  }

  function buildEdges(): void {
    // Index points by x and y for efficient neighbor lookup
    const byX = new Map<number, number[]>(); // x -> sorted indices by y
    const byY = new Map<number, number[]>(); // y -> sorted indices by x

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const xKey = roundKey(p.x);
      const yKey = roundKey(p.y);

      if (!byX.has(xKey)) byX.set(xKey, []);
      byX.get(xKey)!.push(i);

      if (!byY.has(yKey)) byY.set(yKey, []);
      byY.get(yKey)!.push(i);
    }

    // Sort by coordinate
    for (const indices of byX.values()) {
      indices.sort((a, b) => points[a].y - points[b].y);
    }
    for (const indices of byY.values()) {
      indices.sort((a, b) => points[a].x - points[b].x);
    }

    // Horizontal edges (same y, neighbors by x)
    for (const indices of byY.values()) {
      for (let i = 0; i < indices.length - 1; i++) {
        const a = indices[i];
        const b = indices[i + 1];
        if (isVisible(points[a], points[b], expandedRects)) {
          const cost = Math.abs(points[b].x - points[a].x);
          adjacency[a].push({ to: b, direction: "right", cost });
          adjacency[b].push({ to: a, direction: "left", cost });
        }
      }
    }

    // Vertical edges (same x, neighbors by y)
    for (const indices of byX.values()) {
      for (let i = 0; i < indices.length - 1; i++) {
        const a = indices[i];
        const b = indices[i + 1];
        if (isVisible(points[a], points[b], expandedRects)) {
          const cost = Math.abs(points[b].y - points[a].y);
          adjacency[a].push({ to: b, direction: "down", cost });
          adjacency[b].push({ to: a, direction: "up", cost });
        }
      }
    }
  }

  return {
    points,
    neighbors(nodeIndex: number): GraphEdge[] {
      return adjacency[nodeIndex] ?? [];
    },
    getPoint(nodeIndex: number): Point {
      return points[nodeIndex];
    },
    findIndex(p: Point): number {
      return points.findIndex((q) => pointEquals(p, q));
    },
    addPoint(p: Point): number {
      const existing = points.findIndex((q) => pointEquals(p, q));
      if (existing >= 0) return existing;
      const idx = addPointInternal(p);
      // Connect to nearest visible neighbors in each direction
      connectNewPoint(idx);
      return idx;
    },
  };

  function connectNewPoint(idx: number): void {
    const p = points[idx];
    // Find nearest visible neighbor in each direction
    for (let j = 0; j < points.length; j++) {
      if (j === idx) continue;
      const q = points[j];
      if (Math.abs(p.x - q.x) < 1e-9) {
        // Same column
        if (isVisible(p, q, expandedRects)) {
          const cost = Math.abs(q.y - p.y);
          const dir: CardinalDirection = q.y > p.y ? "down" : "up";
          adjacency[idx].push({ to: j, direction: dir, cost });
          adjacency[j].push({
            to: idx,
            direction: dir === "down" ? "up" : "down",
            cost,
          });
        }
      } else if (Math.abs(p.y - q.y) < 1e-9) {
        // Same row
        if (isVisible(p, q, expandedRects)) {
          const cost = Math.abs(q.x - p.x);
          const dir: CardinalDirection = q.x > p.x ? "right" : "left";
          adjacency[idx].push({ to: j, direction: dir, cost });
          adjacency[j].push({
            to: idx,
            direction: dir === "right" ? "left" : "right",
            cost,
          });
        }
      }
    }
  }
}

function roundKey(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function isVisible(a: Point, b: Point, rects: Rect[]): boolean {
  return !rects.some((r) => segmentIntersectsRect(a, b, r));
}
