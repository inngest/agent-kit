import { describe, it, expect } from "vitest";
import { StreamingEngine } from "../../index.js";

const makeInitial = () => ({
  threads: {},
  currentThreadId: "t1",
  lastProcessedIndex: 0,
  isConnected: false,
} as any);

describe("StreamingEngine (hex seam)", () => {
  it("holds and returns state; no-op dispatch retains reference", () => {
    const engine = new StreamingEngine({ initialState: makeInitial(), debug: false });
    const prev = engine.getState();
    engine.dispatch({ type: "UNKNOWN" } as any);
    const next = engine.getState();
    expect(next).toBe(prev);
  });
});


