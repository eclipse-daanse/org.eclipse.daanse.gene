import { describe, it, expect } from "vitest";
import { simplifyPath } from "../../src/postprocess/simplify.js";

describe("simplifyPath", () => {
  it("removes collinear points on horizontal segment", () => {
    const result = simplifyPath([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("removes collinear points on vertical segment", () => {
    const result = simplifyPath([
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 0, y: 10 },
    ]);
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ]);
  });

  it("keeps bend points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const result = simplifyPath(points);
    expect(result).toEqual(points);
  });

  it("handles two-point path", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(simplifyPath(points)).toEqual(points);
  });
});
