import type { Point, Rect } from "../types.js";

export type Orientation = "horizontal" | "vertical";

export function segmentOrientation(a: Point, b: Point): Orientation | null {
  if (Math.abs(a.y - b.y) < 1e-9) return "horizontal";
  if (Math.abs(a.x - b.x) < 1e-9) return "vertical";
  return null;
}

export function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Check if an orthogonal segment (horizontal or vertical) intersects a rect's interior */
export function segmentIntersectsRect(
  p1: Point,
  p2: Point,
  rect: Rect
): boolean {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  const rLeft = rect.x;
  const rRight = rect.x + rect.width;
  const rTop = rect.y;
  const rBottom = rect.y + rect.height;

  // Horizontal segment
  if (Math.abs(p1.y - p2.y) < 1e-9) {
    const y = p1.y;
    if (y <= rTop || y >= rBottom) return false;
    if (maxX <= rLeft || minX >= rRight) return false;
    return true;
  }

  // Vertical segment
  if (Math.abs(p1.x - p2.x) < 1e-9) {
    const x = p1.x;
    if (x <= rLeft || x >= rRight) return false;
    if (maxY <= rTop || minY >= rBottom) return false;
    return true;
  }

  return false;
}

/** Check if two orthogonal segments cross each other */
export function segmentsCross(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point
): boolean {
  const orientA = segmentOrientation(a1, a2);
  const orientB = segmentOrientation(b1, b2);

  if (!orientA || !orientB || orientA === orientB) return false;

  // One is horizontal, one is vertical
  const [h1, h2] = orientA === "horizontal" ? [a1, a2] : [b1, b2];
  const [v1, v2] = orientA === "vertical" ? [a1, a2] : [b1, b2];

  const hY = h1.y;
  const hMinX = Math.min(h1.x, h2.x);
  const hMaxX = Math.max(h1.x, h2.x);

  const vX = v1.x;
  const vMinY = Math.min(v1.y, v2.y);
  const vMaxY = Math.max(v1.y, v2.y);

  return vX > hMinX && vX < hMaxX && hY > vMinY && hY < vMaxY;
}

/** Check if two collinear segments overlap (share more than a point) */
export function segmentsOverlap(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point
): boolean {
  const orientA = segmentOrientation(a1, a2);
  const orientB = segmentOrientation(b1, b2);

  if (!orientA || !orientB || orientA !== orientB) return false;

  if (orientA === "horizontal") {
    if (Math.abs(a1.y - b1.y) > 1e-9) return false;
    const aMin = Math.min(a1.x, a2.x);
    const aMax = Math.max(a1.x, a2.x);
    const bMin = Math.min(b1.x, b2.x);
    const bMax = Math.max(b1.x, b2.x);
    return aMin < bMax && bMin < aMax;
  } else {
    if (Math.abs(a1.x - b1.x) > 1e-9) return false;
    const aMin = Math.min(a1.y, a2.y);
    const aMax = Math.max(a1.y, a2.y);
    const bMin = Math.min(b1.y, b2.y);
    const bMax = Math.max(b1.y, b2.y);
    return aMin < bMax && bMin < aMax;
  }
}
