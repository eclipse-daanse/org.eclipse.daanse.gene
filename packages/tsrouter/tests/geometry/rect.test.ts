import { describe, it, expect } from "vitest";
import { expandRect, rectContains, rectsOverlap, portPosition } from "../../src/geometry/rect.js";

describe("expandRect", () => {
  it("expands rect by margin", () => {
    const r = expandRect({ x: 10, y: 10, width: 100, height: 50 }, 5);
    expect(r).toEqual({ x: 5, y: 5, width: 110, height: 60 });
  });
});

describe("rectContains", () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 };

  it("returns true for interior point", () => {
    expect(rectContains(rect, { x: 50, y: 50 })).toBe(true);
  });

  it("returns false for boundary point (exclusive)", () => {
    expect(rectContains(rect, { x: 0, y: 50 })).toBe(false);
  });

  it("returns false for exterior point", () => {
    expect(rectContains(rect, { x: 150, y: 50 })).toBe(false);
  });
});

describe("rectsOverlap", () => {
  it("detects overlap", () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 }
      )
    ).toBe(true);
  });

  it("detects non-overlap", () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 200, y: 200, width: 100, height: 100 }
      )
    ).toBe(false);
  });
});

describe("portPosition", () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 };

  it("calculates right side port", () => {
    expect(portPosition(rect, "right", 0.5)).toEqual({ x: 300, y: 150 });
  });

  it("calculates top side port", () => {
    expect(portPosition(rect, "top", 0.5)).toEqual({ x: 200, y: 100 });
  });

  it("calculates left side port at offset 0.25", () => {
    expect(portPosition(rect, "left", 0.25)).toEqual({ x: 100, y: 125 });
  });
});
