import { describe, it, expect } from "vitest";
import { PriorityQueue } from "../../src/pathfinding/priority-queue.js";

describe("PriorityQueue", () => {
  it("pops in priority order", () => {
    const pq = new PriorityQueue<string>();
    pq.push("c", 3);
    pq.push("a", 1);
    pq.push("b", 2);

    expect(pq.pop()).toBe("a");
    expect(pq.pop()).toBe("b");
    expect(pq.pop()).toBe("c");
  });

  it("returns undefined when empty", () => {
    const pq = new PriorityQueue<number>();
    expect(pq.pop()).toBeUndefined();
  });

  it("tracks size correctly", () => {
    const pq = new PriorityQueue<number>();
    expect(pq.size).toBe(0);
    pq.push(1, 1);
    expect(pq.size).toBe(1);
    pq.pop();
    expect(pq.size).toBe(0);
  });
});
