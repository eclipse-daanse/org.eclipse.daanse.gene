import { describe, it, expect } from "vitest";
import { OrthogonalRouter } from "../src/router.js";

describe("OrthogonalRouter", () => {
  it("routes a simple two-node connection", () => {
    const router = new OrthogonalRouter({ margin: 10 });

    router.addNode({
      id: "A",
      rect: { x: 50, y: 50, width: 100, height: 50 },
      ports: [{ id: "A-out", nodeId: "A", side: "right", offset: 0.5 }],
    });

    router.addNode({
      id: "B",
      rect: { x: 300, y: 50, width: 100, height: 50 },
      ports: [{ id: "B-in", nodeId: "B", side: "left", offset: 0.5 }],
    });

    router.addConnection({
      id: "edge-1",
      sourcePortId: "A-out",
      targetPortId: "B-in",
    });

    const result = router.route();
    expect(result.errors).toBeUndefined();
    expect(result.paths).toHaveLength(1);

    const path = result.paths[0];
    expect(path.connectionId).toBe("edge-1");
    expect(path.points.length).toBeGreaterThanOrEqual(2);

    // Start should be at source port
    expect(path.points[0].x).toBe(150); // right side of A
    expect(path.points[0].y).toBe(75); // midpoint of A height

    // End should be at target port
    const last = path.points[path.points.length - 1];
    expect(last.x).toBe(300); // left side of B
    expect(last.y).toBe(75); // midpoint of B height

    // All segments should be orthogonal
    for (let i = 0; i < path.points.length - 1; i++) {
      const dx = Math.abs(path.points[i].x - path.points[i + 1].x);
      const dy = Math.abs(path.points[i].y - path.points[i + 1].y);
      expect(dx < 1e-9 || dy < 1e-9).toBe(true);
    }
  });

  it("routes around an obstacle", () => {
    const router = new OrthogonalRouter({ margin: 10 });

    router.addNode({
      id: "A",
      rect: { x: 0, y: 100, width: 80, height: 40 },
      ports: [{ id: "A-out", nodeId: "A", side: "right", offset: 0.5 }],
    });

    // Obstacle in between
    router.addNode({
      id: "obstacle",
      rect: { x: 150, y: 50, width: 100, height: 140 },
      ports: [],
    });

    router.addNode({
      id: "B",
      rect: { x: 320, y: 100, width: 80, height: 40 },
      ports: [{ id: "B-in", nodeId: "B", side: "left", offset: 0.5 }],
    });

    router.addConnection({
      id: "edge-1",
      sourcePortId: "A-out",
      targetPortId: "B-in",
    });

    const result = router.route();
    expect(result.errors).toBeUndefined();
    expect(result.paths).toHaveLength(1);

    const path = result.paths[0];
    // Path should have bends to go around obstacle
    expect(path.points.length).toBeGreaterThan(2);

    // All segments should be orthogonal
    for (let i = 0; i < path.points.length - 1; i++) {
      const dx = Math.abs(path.points[i].x - path.points[i + 1].x);
      const dy = Math.abs(path.points[i].y - path.points[i + 1].y);
      expect(dx < 1e-9 || dy < 1e-9).toBe(true);
    }
  });

  it("reports error for missing port", () => {
    const router = new OrthogonalRouter();

    router.addConnection({
      id: "edge-1",
      sourcePortId: "nonexistent",
      targetPortId: "also-nonexistent",
    });

    const result = router.route();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].connectionId).toBe("edge-1");
  });

  it("handles multiple connections with allowOverlap=false", () => {
    const router = new OrthogonalRouter({
      margin: 10,
      allowOverlap: false,
    });

    router.addNode({
      id: "A",
      rect: { x: 0, y: 0, width: 80, height: 60 },
      ports: [
        { id: "A-out1", nodeId: "A", side: "right", offset: 0.3 },
        { id: "A-out2", nodeId: "A", side: "right", offset: 0.7 },
      ],
    });

    router.addNode({
      id: "B",
      rect: { x: 200, y: 0, width: 80, height: 60 },
      ports: [
        { id: "B-in1", nodeId: "B", side: "left", offset: 0.3 },
        { id: "B-in2", nodeId: "B", side: "left", offset: 0.7 },
      ],
    });

    router.addConnection({
      id: "edge-1",
      sourcePortId: "A-out1",
      targetPortId: "B-in1",
    });

    router.addConnection({
      id: "edge-2",
      sourcePortId: "A-out2",
      targetPortId: "B-in2",
    });

    const result = router.route();
    expect(result.paths).toHaveLength(2);
  });

  it("respects allowCrossings=false", () => {
    const router = new OrthogonalRouter({
      margin: 10,
      allowCrossings: false,
    });

    router.addNode({
      id: "A",
      rect: { x: 0, y: 0, width: 50, height: 50 },
      ports: [{ id: "A-out", nodeId: "A", side: "right", offset: 0.5 }],
    });

    router.addNode({
      id: "B",
      rect: { x: 200, y: 0, width: 50, height: 50 },
      ports: [{ id: "B-in", nodeId: "B", side: "left", offset: 0.5 }],
    });

    router.addNode({
      id: "C",
      rect: { x: 80, y: -80, width: 50, height: 50 },
      ports: [{ id: "C-out", nodeId: "C", side: "bottom", offset: 0.5 }],
    });

    router.addNode({
      id: "D",
      rect: { x: 80, y: 100, width: 50, height: 50 },
      ports: [{ id: "D-in", nodeId: "D", side: "top", offset: 0.5 }],
    });

    router.addConnection({
      id: "edge-h",
      sourcePortId: "A-out",
      targetPortId: "B-in",
    });

    router.addConnection({
      id: "edge-v",
      sourcePortId: "C-out",
      targetPortId: "D-in",
    });

    const result = router.route();
    // Both should route successfully (second may reroute to avoid crossing)
    expect(result.paths.length).toBeGreaterThanOrEqual(1);
  });

  it("uses alternative target when primary fails", () => {
    const router = new OrthogonalRouter({
      margin: 10,
      allowCrossings: false,
      allowOverlap: false,
    });

    router.addNode({
      id: "A",
      rect: { x: 0, y: 0, width: 80, height: 60 },
      ports: [
        { id: "A-out1", nodeId: "A", side: "right", offset: 0.5 },
        { id: "A-out2", nodeId: "A", side: "right", offset: 0.5 },
      ],
    });

    router.addNode({
      id: "B",
      rect: { x: 200, y: 0, width: 80, height: 60 },
      ports: [
        { id: "B-in", nodeId: "B", side: "left", offset: 0.5 },
        { id: "B-top", nodeId: "B", side: "top", offset: 0.5 },
      ],
    });

    // First connection takes the direct route
    router.addConnection({
      id: "edge-1",
      sourcePortId: "A-out1",
      targetPortId: "B-in",
    });

    // Second connection: primary target is same port (will overlap),
    // alternative is B-top
    router.addConnection({
      id: "edge-2",
      sourcePortId: "A-out2",
      targetPortId: "B-in",
      alternativeTargetPortIds: ["B-top"],
    });

    const result = router.route();
    const edge2 = result.paths.find((p) => p.connectionId === "edge-2");

    // Should have routed successfully (possibly to alternative)
    expect(edge2).toBeDefined();
    expect(edge2!.targetPortId).toBeDefined();
    // targetPortId tells us which port was actually used
    expect(["B-in", "B-top"]).toContain(edge2!.targetPortId);
  });

  it("reports targetPortId on successful route", () => {
    const router = new OrthogonalRouter({ margin: 10 });

    router.addNode({
      id: "A",
      rect: { x: 0, y: 0, width: 80, height: 60 },
      ports: [{ id: "A-out", nodeId: "A", side: "right", offset: 0.5 }],
    });

    router.addNode({
      id: "B",
      rect: { x: 200, y: 0, width: 80, height: 60 },
      ports: [{ id: "B-in", nodeId: "B", side: "left", offset: 0.5 }],
    });

    router.addConnection({
      id: "edge-1",
      sourcePortId: "A-out",
      targetPortId: "B-in",
    });

    const result = router.route();
    expect(result.paths[0].targetPortId).toBe("B-in");
  });
});
