import type { Point, Rect, Direction } from "../types.js";

export function expandRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + 2 * margin,
    height: rect.height + 2 * margin,
  };
}

export function rectContains(rect: Rect, p: Point): boolean {
  return (
    p.x > rect.x &&
    p.x < rect.x + rect.width &&
    p.y > rect.y &&
    p.y < rect.y + rect.height
  );
}

export function rectContainsInclusive(rect: Rect, p: Point): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function rectCorners(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

export function portPosition(
  rect: Rect,
  side: Direction,
  offset: number
): Point {
  switch (side) {
    case "top":
      return { x: rect.x + rect.width * offset, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width * offset, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + rect.height * offset };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height * offset };
  }
}
