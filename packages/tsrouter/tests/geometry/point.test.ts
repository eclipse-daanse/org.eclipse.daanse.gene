import { describe, it, expect } from "vitest";
import { pointEquals, manhattanDistance, euclideanDistance } from "../../src/geometry/point.js";

describe("pointEquals", () => {
  it("returns true for equal points", () => {
    expect(pointEquals({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
  });

  it("returns false for different points", () => {
    expect(pointEquals({ x: 1, y: 2 }, { x: 3, y: 2 })).toBe(false);
  });

  it("handles floating point near-equality", () => {
    expect(pointEquals({ x: 1.0000000001, y: 2 }, { x: 1, y: 2 })).toBe(true);
  });
});

describe("manhattanDistance", () => {
  it("calculates correct distance", () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });
});

describe("euclideanDistance", () => {
  it("calculates correct distance", () => {
    expect(euclideanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
