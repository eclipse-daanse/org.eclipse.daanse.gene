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
}

export interface RouterOptions {
  margin: number;
  bendPenalty: number;
  nudgeDistance: number;
  lineMargin: number;
  allowCrossings: boolean;
  crossingPenalty: number;
  allowOverlap: boolean;
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
}

export interface RoutingError {
  connectionId: string;
  message: string;
}

export interface RoutingResult {
  paths: RoutedPath[];
  errors?: RoutingError[];
}
