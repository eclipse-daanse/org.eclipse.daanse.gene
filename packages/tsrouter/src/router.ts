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
  Zone,
} from "./types.js";
import { DEFAULT_OPTIONS } from "./types.js";
import { expandRect, portPosition } from "./geometry/rect.js";
import { segmentIntersectsRect, segmentsCross, segmentsOverlap } from "./geometry/segment.js";
import { buildVisibilityGraph } from "./graph/visibility-graph.js";
import { astar } from "./pathfinding/astar.js";
import { simplifyPath } from "./postprocess/simplify.js";
import { nudgePaths } from "./postprocess/nudge.js";
import { mergeBundles } from "./postprocess/merge.js";

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

/** Farthest apart two parallel stretches of a bundle may run to be pulled onto one line */
const MERGE_GAP = 120;

export class OrthogonalRouter {
  private options: RouterOptions;
  private nodes = new Map<string, NodeRect>();
  private connections = new Map<string, ConnectionRequest>();
  private zones = new Map<string, Zone>();

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

  addZone(zone: Zone): void {
    this.zones.set(zone.id, zone);
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
    const { margin, bendPenalty, allowCrossings, crossingPenalty, allowOverlap, nudgeDistance, lineMargin, portStub, arrowGuard } =
      this.options;

    // Build port lookup: portId -> { pos (on node boundary), projected (outside expanded rect), side }
    const portInfo = new Map<
      string,
      { pos: Point; projected: Point; side: Direction; ownStub: boolean }
    >();
    for (const node of this.nodes.values()) {
      for (const port of node.ports) {
        const pos = portPosition(node.rect, port.side, port.offset);
        // The first bend lies at least portStub off the port (straight out of it, room for an arrow head)
        const projected = projectPort(pos, port.side, Math.max(margin, port.stub ?? portStub ?? 0));
        portInfo.set(port.id, { pos, projected, side: port.side, ownStub: port.stub != null });
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
    // Zones, kept clear by margin: their borders give ways round them
    const zoneRects = Array.from(this.zones.values()).map((z) => ({ id: z.id, rect: expandRect(z.rect, margin) }));
    const graph = buildVisibilityGraph(expandedRects, allProjectedPoints, zoneRects.map((z) => z.rect));

    // Route connections sequentially (for crossing/overlap avoidance)
    const routedSegments: { p1: Point; p2: Point; groups?: string[] }[] = [];
    /** The bundles of the connection being routed: segments of a connection sharing one are no obstacle */
    let currentGroups: string[] = [];
    /** Zones the connection being routed is kept out of */
    let closedZones: Rect[] = [];
    /** The room around each target port's arrow (arrowGuard), and the port it belongs to */
    const guards: { portId: string; rect: Rect }[] = [];
    if (arrowGuard) {
      const targets = new Set(Array.from(this.connections.values()).map((c) => c.targetPortId));
      for (const id of targets) {
        const info = portInfo.get(id);
        if (!info || info.ownStub) continue;
        const { pos, projected } = info;
        const x0 = Math.min(pos.x, projected.x), x1 = Math.max(pos.x, projected.x);
        const y0 = Math.min(pos.y, projected.y), y1 = Math.max(pos.y, projected.y);
        const vertical = Math.abs(pos.x - projected.x) < 1e-6;
        guards.push({
          portId: id,
          rect: vertical
            ? { x: x0 - arrowGuard, y: y0, width: x1 - x0 + 2 * arrowGuard, height: y1 - y0 }
            : { x: x0, y: y0 - arrowGuard, width: x1 - x0, height: y1 - y0 + 2 * arrowGuard },
        });
      }
    }
    let currentTarget = "";
    /** Where the connection being routed leaves its port's straight piece, and which way - it may not turn back there */
    let startPoint: Point | null = null;
    let startDir: Point = { x: 0, y: 0 };
    /** Zones it may cross: crossing their border on a way of its own costs extra - it rather joins its bundle inside */
    let openZones: Rect[] = [];
    /** Where a group crossed a zone's border ("group|zone"): its others cross there too, bundled - nowhere else */
    const crossed = new Set<string>();
    let openZoneIds: string[] = [];
    const ZONE_BORDER_PENALTY = 300;
    const inside = (p: Point, r: Rect) => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
    const bundledWith = (seg: { groups?: string[] }) =>
      currentGroups.length > 0 && !!seg.groups?.some((g) => currentGroups.includes(g));
    /** Following a segment of a shared bundle costs much less - connections merge as early as they can */
    const BUNDLE_FACTOR = 0.05;

    // Build wrapped graph once (captures routedSegments by reference)
    const wrappedGraph = {
      getPoint: (i: number) => graph.getPoint(i),
      neighbors: (i: number) => {
        const edges = graph.neighbors(i);
        if (routedSegments.length === 0 && closedZones.length === 0 && guards.length === 0 && !startPoint) return edges;

        return edges
          .filter((edge) => {
            const p1 = graph.getPoint(i);
            const p2 = graph.getPoint(edge.to);

            for (const zone of closedZones) {
              if (segmentIntersectsRect(p1, p2, zone)) return false;
            }
            // No turning straight back at the end of the port's straight piece
            if (startPoint && Math.abs(p1.x - startPoint.x) < 1e-6 && Math.abs(p1.y - startPoint.y) < 1e-6) {
              const dx = Math.sign(p2.x - p1.x), dy = Math.sign(p2.y - p1.y);
              if (dx === -startDir.x && dy === -startDir.y) return false;
            }
            // Clear of other connections' arrows
            for (const g of guards) {
              if (g.portId !== currentTarget && segmentIntersectsRect(p1, p2, g.rect)) return false;
            }

            // A zone's border a group already crossed: only on that crossing (on a segment of the group)
            for (let zi = 0; zi < openZones.length; zi++) {
              const zone = openZones[zi];
              if (inside(p1, zone) === inside(p2, zone)) continue;
              if (!currentGroups.some((g) => crossed.has(`${g}|${openZoneIds[zi]}`))) continue;
              const onBundle = routedSegments.some((seg) => bundledWith(seg) && segmentsOverlap(p1, p2, seg.p1, seg.p2));
              if (!onBundle) return false;
            }

            if (!allowOverlap) {
              for (const seg of routedSegments) {
                if (bundledWith(seg)) continue;
                if (segmentsOverlap(p1, p2, seg.p1, seg.p2)) {
                  return false;
                }
              }
            }

            if (!allowCrossings) {
              for (const seg of routedSegments) {
                if (bundledWith(seg)) continue;
                if (segmentsCross(p1, p2, seg.p1, seg.p2)) {
                  return false;
                }
              }
            }

            return true;
          })
          .map((edge) => {
            if (routedSegments.length === 0 && openZones.length === 0) return edge;

            const p1 = graph.getPoint(i);
            const p2 = graph.getPoint(edge.to);
            let extraCost = 0;
            let bundled = false;
            for (const seg of routedSegments) {
              if (bundledWith(seg)) {
                if (segmentsOverlap(p1, p2, seg.p1, seg.p2)) bundled = true;
                continue;
              }
              if (allowCrossings && segmentsCross(p1, p2, seg.p1, seg.p2)) {
                extraCost += crossingPenalty;
              }
            }
            // Leaving or entering a frame on a way of its own costs extra: a bundle crosses the border together
            if (!bundled) {
              for (const zone of openZones) {
                if (inside(p1, zone) !== inside(p2, zone)) extraCost += ZONE_BORDER_PENALTY;
              }
            }
            const cost = (bundled ? edge.cost * BUNDLE_FACTOR : edge.cost) + extraCost;
            return cost !== edge.cost ? { ...edge, cost } : edge;
          });
      },
    };

    /** Per routed connection: its path and segments (with the zone borders it crosses) */
    type Routed = { path: RoutedPath; segments: { p1: Point; p2: Point; groups?: string[] }[]; crossings: string[] };
    const byConn = new Map<string, Routed>();

    /** The shared state as the routed connections leave it - without one being routed again */
    const rebuild = (without?: string) => {
      routedSegments.length = 0;
      crossed.clear();
      for (const [id, r] of byConn) {
        if (id === without) continue;
        routedSegments.push(...r.segments);
        for (const c of r.crossings) crossed.add(c);
      }
    };

    const routeOne = (conn: ConnectionRequest): Routed | string => {
      const source = portInfo.get(conn.sourcePortId);
      if (!source) return `Port not found: ${conn.sourcePortId}`;

      const startIdx = graph.findIndex(source.projected);
      if (startIdx < 0) return "Source port position not in visibility graph";
      startPoint = source.projected;
      startDir = { x: Math.sign(source.projected.x - source.pos.x), y: Math.sign(source.projected.y - source.pos.y) };

      // Build list of target port IDs to try: primary first, then alternatives
      const targetPortIds = [
        conn.targetPortId,
        ...(conn.alternativeTargetPortIds ?? []),
      ];

      currentGroups = conn.groups ?? [];
      currentTarget = conn.targetPortId;
      closedZones = zoneRects.filter((z) => !(conn.zones ?? []).includes(z.id)).map((z) => z.rect);
      const open = zoneRects.filter((z) => (conn.zones ?? []).includes(z.id));
      openZones = open.map((z) => z.rect);
      openZoneIds = open.map((z) => z.id);

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

        const segments: Routed["segments"] = [];
        const crossings: string[] = [];
        for (let i = 0; i < simplified.length - 1; i++) {
          segments.push({ p1: simplified[i], p2: simplified[i + 1], groups: conn.groups });
          for (let zi = 0; zi < openZones.length; zi++) {
            if (inside(simplified[i], openZones[zi]) !== inside(simplified[i + 1], openZones[zi])) {
              for (const g of conn.groups ?? []) crossings.push(`${g}|${openZoneIds[zi]}`);
            }
          }
        }
        return {
          path: { connectionId: conn.id, points: simplified, targetPortId, groups: conn.groups },
          segments,
          crossings,
        };
      }
      return "No path found to any target port";
    };

    // First pass: one after the other, each with those before it in place (crossings, bundles)
    for (const conn of this.connections.values()) {
      const r = routeOne(conn);
      if (typeof r === "string") {
        errors.push({ connectionId: conn.id, message: r });
        continue;
      }
      byConn.set(conn.id, r);
      routedSegments.push(...r.segments);
      for (const c of r.crossings) crossed.add(c);
    }

    // Second pass: bundled connections once more, now with all others in place - an early one can take the
    // way later ones of its bundle came, so bundles meet as soon as they can (right after leaving their frames)
    const bundled = Array.from(this.connections.values()).filter((c) => (c.groups?.length ?? 0) > 0 && byConn.has(c.id));
    if (bundled.length > 1) {
      for (const conn of bundled) {
        const before = byConn.get(conn.id)!;
        rebuild(conn.id);
        const r = routeOne(conn);
        if (typeof r !== "string") byConn.set(conn.id, r);
        else byConn.set(conn.id, before);
      }
      rebuild();
    }

    for (const conn of this.connections.values()) {
      const r = byConn.get(conn.id);
      if (r) paths.push(r.path);
    }

    // Post-process: nudge overlapping parallel segments
    // Bundles side by side meet where they run parallel (not only further on), then the rest is nudged apart
    const merged = mergeBundles(
      paths,
      Array.from(this.nodes.values()).map((n) => expandRect(n.rect, Math.min(margin, 4))),
      MERGE_GAP,
      portStub ?? 0,
      zoneRects,
      new Map(Array.from(this.connections.values()).map((c) => [c.id, c.zones ?? []]))
    );
    const nudgedPaths = nudgePaths(merged, nudgeDistance, lineMargin);

    return {
      paths: nudgedPaths,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
