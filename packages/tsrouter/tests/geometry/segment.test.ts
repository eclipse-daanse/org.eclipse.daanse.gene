import { describe, it, expect } from "vitest";
import {
  segmentOrientation,
  segmentIntersectsRect,
  segmentsCross,
  segmentsOverlap,
} from "../../src/geometry/segment.js";

describe("segmentOrientation", () => {
  it("detects horizontal", () => {
    expect(segmentOrientation({ x: 0, y: 5 }, { x: 10, y: 5 })).toBe("horizontal");
  });

  it("detects vertical", () => {
    expect(segmentOrientation({ x: 5, y: 0 }, { x: 5, y: 10 })).toBe("vertical");
  });

  it("returns null for diagonal", () => {
    expect(segmentOrientation({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeNull();
  });
});

describe("segmentIntersectsRect", () => {
  const rect = { x: 10, y: 10, width: 20, height: 20 };

  it("horizontal segment through rect", () => {
    expect(segmentIntersectsRect({ x: 0, y: 20 }, { x: 40, y: 20 }, rect)).toBe(true);
  });

  it("horizontal segment above rect", () => {
    expect(segmentIntersectsRect({ x: 0, y: 5 }, { x: 40, y: 5 }, rect)).toBe(false);
  });

  it("vertical segment through rect", () => {
    expect(segmentIntersectsRect({ x: 20, y: 0 }, { x: 20, y: 40 }, rect)).toBe(true);
  });

  it("vertical segment beside rect", () => {
    expect(segmentIntersectsRect({ x: 5, y: 0 }, { x: 5, y: 40 }, rect)).toBe(false);
  });
});

describe("segmentsCross", () => {
  it("detects crossing", () => {
    expect(
      segmentsCross({ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 5, y: 0 }, { x: 5, y: 10 })
    ).toBe(true);
  });

  it("no crossing for parallel", () => {
    expect(
      segmentsCross({ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 0, y: 8 }, { x: 10, y: 8 })
    ).toBe(false);
  });

  it("no crossing for non-intersecting perpendicular", () => {
    expect(
      segmentsCross({ x: 0, y: 5 }, { x: 3, y: 5 }, { x: 5, y: 0 }, { x: 5, y: 10 })
    ).toBe(false);
  });
});

describe("segmentsOverlap", () => {
  it("detects horizontal overlap", () => {
    expect(
      segmentsOverlap({ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 5, y: 5 }, { x: 15, y: 5 })
    ).toBe(true);
  });

  it("no overlap for different y", () => {
    expect(
      segmentsOverlap({ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 0, y: 6 }, { x: 10, y: 6 })
    ).toBe(false);
  });

  it("no overlap for non-overlapping range", () => {
    expect(
      segmentsOverlap({ x: 0, y: 5 }, { x: 3, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 5 })
    ).toBe(false);
  });
});
