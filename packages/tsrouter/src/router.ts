import type {
  NodeRect,
  ConnectionRequest,
  RouterOptions,
  RoutingResult,
  RoutedPath,
  RoutingError,
  Point,
  Rect,
  Direction,
} from "./types.js";
import { DEFAULT_OPTIONS } from "./types.js";
import { expandRect, portPosition } from "./geometry/rect.js";
import { segmentsCross, segmentsOverlap } from "./geometry/segment.js";
import { buildVisibilityGraph } from "./graph/visibility-graph.js";
import { astar } from "./pathfinding/astar.js";
import { simplifyPath } from "./postprocess/simplify.js";
import { nudgePaths } from "./postprocess/nudge.js";

/** Project a port position outward by margin so it sits outside the expanded rect */
function projectPort(pos: Point, side: Direction, margin: number): Point {
  switch (side) {
    case "top":
      return { x: pos.x, y: pos.y - margin };
    case "bottom":
      return { x: pos.x, y: pos.y + margin };
    case "left":
      return { x: pos.x - margin, y: pos.y };
    case "right":
      return { x: pos.x + margin, y: pos.y };
  }
}

export class OrthogonalRouter {
  private options: RouterOptions;
  private nodes = new Map<string, NodeRect>();
  private connections = new Map<string, ConnectionRequest>();

  constructor(options?: Partial<RouterOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  addNode(node: NodeRect): void {
    this.nodes.set(node.id, node);
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  updateNode(nodeId: string, rect: Rect): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.rect = rect;
    }
  }

  addConnection(conn: ConnectionRequest): void {
    this.connections.set(conn.id, conn);
  }

  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  getNodes(): ReadonlyArray<NodeRect> {
    return Array.from(this.nodes.values());
  }

  getConnections(): ReadonlyArray<ConnectionRequest> {
    return Array.from(this.connections.values());
  }

  route(): RoutingResult {
    const paths: RoutedPath[] = [];
    const errors: RoutingError[] = [];
    const { margin, bendPenalty, allowCrossings, crossingPenalty, allowOverlap, nudgeDistance, lineMargin } =
      this.options;

    // Build port lookup: portId -> { pos (on node boundary), projected (outside expanded rect), side }
    const portInfo = new Map<
      string,
      { pos: Point; projected: Point; side: Direction }
    >();
    for (const node of this.nodes.values()) {
      for (const port of node.ports) {
        const pos = portPosition(node.rect, port.side, port.offset);
        const projected = projectPort(pos, port.side, margin);
        portInfo.set(port.id, { pos, projected, side: port.side });
      }
    }

    // Expanded rects for obstacle avoidance
    const expandedRects: Rect[] = [];
    for (const node of this.nodes.values()) {
      expandedRects.push(expandRect(node.rect, margin));
    }

    // Use projected port points for graph construction (they sit on the expanded rect boundary)
    const allProjectedPoints: Point[] = Array.from(portInfo.values()).map(
      (p) => p.projected
    );

    // Build the visibility graph
    const graph = buildVisibilityGraph(expandedRects, allProjectedPoints);

    // Route connections sequentially (for crossing/overlap avoidance)
    const routedSegments: { p1: Point; p2: Point }[] = [];

    // Build wrapped graph once (captures routedSegments by reference)
    const wrappedGraph = {
      getPoint: (i: number) => graph.getPoint(i),
      neighbors: (i: number) => {
        const edges = graph.neighbors(i);
        if (routedSegments.length === 0) return edges;

        return edges
          .filter((edge) => {
            const p1 = graph.getPoint(i);
            const p2 = graph.getPoint(edge.to);

            if (!allowOverlap) {
              for (const seg of routedSegments) {
                if (segmentsOverlap(p1, p2, seg.p1, seg.p2)) {
                  return false;
                }
              }
            }

            if (!allowCrossings) {
              for (const seg of routedSegments) {
                if (segmentsCross(p1, p2, seg.p1, seg.p2)) {
                  return false;
                }
              }
            }

            return true;
          })
          .map((edge) => {
            if (!allowCrossings || routedSegments.length === 0) return edge;

            const p1 = graph.getPoint(i);
            const p2 = graph.getPoint(edge.to);
            let extraCost = 0;
            for (const seg of routedSegments) {
              if (segmentsCross(p1, p2, seg.p1, seg.p2)) {
                extraCost += crossingPenalty;
              }
            }
            return extraCost > 0
              ? { ...edge, cost: edge.cost + extraCost }
              : edge;
          });
      },
    };

    for (const conn of this.connections.values()) {
      const source = portInfo.get(conn.sourcePortId);
      if (!source) {
        errors.push({
          connectionId: conn.id,
          message: `Port not found: ${conn.sourcePortId}`,
        });
        continue;
      }

      const startIdx = graph.findIndex(source.projected);
      if (startIdx < 0) {
        errors.push({
          connectionId: conn.id,
          message: "Source port position not in visibility graph",
        });
        continue;
      }

      // Build list of target port IDs to try: primary first, then alternatives
      const targetPortIds = [
        conn.targetPortId,
        ...(conn.alternativeTargetPortIds ?? []),
      ];

      let routed = false;

      for (const targetPortId of targetPortIds) {
        const target = portInfo.get(targetPortId);
        if (!target) continue;

        const endIdx = graph.findIndex(target.projected);
        if (endIdx < 0) continue;

        const pathIndices = astar(wrappedGraph, startIdx, endIdx, { bendPenalty });
        if (!pathIndices) continue;

        const rawPoints = pathIndices.map((i) => graph.getPoint(i));
        const fullPath = [source.pos, ...rawPoints, target.pos];
        const simplified = simplifyPath(fullPath);

        // Register routed segments for subsequent paths
        for (let i = 0; i < simplified.length - 1; i++) {
          routedSegments.push({ p1: simplified[i], p2: simplified[i + 1] });
        }

        paths.push({
          connectionId: conn.id,
          points: simplified,
          targetPortId,
        });

        routed = true;
        break;
      }

      if (!routed) {
        errors.push({
          connectionId: conn.id,
          message: "No path found to any target port",
        });
      }
    }

    // Post-process: nudge overlapping parallel segments
    const nudgedPaths = nudgePaths(paths, nudgeDistance, lineMargin);

    return {
      paths: nudgedPaths,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
