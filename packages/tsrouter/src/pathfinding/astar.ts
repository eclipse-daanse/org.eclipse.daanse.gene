import type { Point } from "../types.js";
import { manhattanDistance } from "../geometry/point.js";
import { PriorityQueue } from "./priority-queue.js";

export type CardinalDirection = "up" | "down" | "left" | "right";

export interface GraphEdge {
  to: number;
  cost: number;
  direction: CardinalDirection;
}

export interface AStarGraph {
  neighbors(nodeIndex: number): GraphEdge[];
  getPoint(nodeIndex: number): Point;
}

interface AStarState {
  nodeIndex: number;
  direction: CardinalDirection | null;
}

function stateKey(s: AStarState): string {
  return `${s.nodeIndex}:${s.direction ?? "none"}`;
}

export interface AStarOptions {
  bendPenalty: number;
}

export function astar(
  graph: AStarGraph,
  startIndex: number,
  endIndex: number,
  options: AStarOptions
): number[] | null {
  const target = graph.getPoint(endIndex);
  const pq = new PriorityQueue<AStarState>();
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, AStarState | null>();

  const startState: AStarState = { nodeIndex: startIndex, direction: null };
  const startKey = stateKey(startState);
  gScore.set(startKey, 0);
  cameFrom.set(startKey, null);
  pq.push(startState, manhattanDistance(graph.getPoint(startIndex), target));

  while (pq.size > 0) {
    const current = pq.pop()!;
    const currentKey = stateKey(current);
    const currentG = gScore.get(currentKey)!;

    if (current.nodeIndex === endIndex) {
      // Reconstruct path
      const path: number[] = [];
      let state: AStarState | null = current;
      while (state !== null) {
        path.push(state.nodeIndex);
        state = cameFrom.get(stateKey(state)) ?? null;
      }
      path.reverse();
      return path;
    }

    for (const edge of graph.neighbors(current.nodeIndex)) {
      const bend =
        current.direction !== null && edge.direction !== current.direction
          ? options.bendPenalty
          : 0;
      const tentativeG = currentG + edge.cost + bend;

      const nextState: AStarState = {
        nodeIndex: edge.to,
        direction: edge.direction,
      };
      const nextKey = stateKey(nextState);

      const existingG = gScore.get(nextKey);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScore.set(nextKey, tentativeG);
      cameFrom.set(nextKey, current);
      const h = manhattanDistance(graph.getPoint(edge.to), target);
      pq.push(nextState, tentativeG + h);
    }
  }

  return null;
}
