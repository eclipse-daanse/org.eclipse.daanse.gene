export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Direction = "top" | "right" | "bottom" | "left";

export interface Port {
  id: string;
  nodeId: string;
  side: Direction;
  offset: number;
  /** Straight piece off this port instead of RouterOptions.portStub; a port with its own stub (e.g. a
   * waypoint where lines meet, no arrow) gets no arrow guard either */
  stub?: number;
}

export interface NodeRect {
  id: string;
  rect: Rect;
  ports: Port[];
}

export interface ConnectionRequest {
  id: string;
  sourcePortId: string;
  targetPortId: string;
  alternativeTargetPortIds?: string[];
  /**
   * Bundles the connection belongs to (e.g. one kind of reference into one port, or out of one):
   * connections sharing a group may run on top of each other - and prefer to, as early as they can:
   * they merge into one line instead of running side by side.
   */
  groups?: string[];
  /** Zones (see OrthogonalRouter.addZone) the connection may pass through - all others it keeps out of */
  zones?: string[];
}

/**
 * An area connections keep out of unless they are let in (ConnectionRequest.zones) - e.g. a frame
 * only connections from or to something inside it cross. Unlike a node it is no obstacle as such.
 */
export interface Zone {
  id: string;
  rect: Rect;
}

export interface RouterOptions {
  margin: number;
  bendPenalty: number;
  nudgeDistance: number;
  lineMargin: number;
  allowCrossings: boolean;
  crossingPenalty: number;
  allowOverlap: boolean;
  /**
   * Least length of the straight piece a connection leaves and enters a port with, before it may bend
   * (room for an arrow head); the margin when smaller
   */
  portStub?: number;
  /**
   * Room kept around the arrow at each target port: a strip this wide on either side of the line,
   * as long as the port's straight piece - only connections into that port enter it
   */
  arrowGuard?: number;
}

export const DEFAULT_OPTIONS: RouterOptions = {
  margin: 20,
  bendPenalty: 50,
  nudgeDistance: 10,
  lineMargin: 10,
  allowCrossings: true,
  crossingPenalty: 100,
  allowOverlap: false,
};

export interface RoutedPath {
  connectionId: string;
  points: Point[];
  targetPortId: string;
  /** The connection's bundles, if any (see ConnectionRequest.groups) */
  groups?: string[];
}

export interface RoutingError {
  connectionId: string;
  message: string;
}

export interface RoutingResult {
  paths: RoutedPath[];
  errors?: RoutingError[];
}
