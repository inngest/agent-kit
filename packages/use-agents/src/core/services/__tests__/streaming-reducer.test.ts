import { describe, it, expect } from "vitest";
import { reduceStreamingState } from "../../index.js";
import type { StreamingState, StreamingAction } from "../../../types/index.js";

function makeState(): StreamingState {
  return {
    threads: {},
    currentThreadId: "t1",
    lastProcessedIndex: 0,
    isConnected: false,
  } as StreamingState;
}

describe("reduceStreamingState (hex core seam)", () => {
  it("returns same reference for unknown actions (no behavior change)", () => {
    const state = makeState();
    const action = { type: "UNKNOWN_ACTION" } as unknown as StreamingAction;
    const result = reduceStreamingState(state, action, false);
    expect(result).toBe(state);
  });

  it("handles run.started and run.completed", () => {
    let state = makeState();
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          { event: "run.started", data: { threadId: "t1", name: "agent" }, timestamp: Date.now(), sequenceNumber: 1, id: "e1" },
        ] as any,
      },
      false
    );
    expect(state.threads["t1"].agentStatus).toBe("thinking");
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          { event: "run.completed", data: { threadId: "t1" }, timestamp: Date.now(), sequenceNumber: 2, id: "e2" },
        ] as any,
      },
      false
    );
    expect(state.threads["t1"].agentStatus).toBe("idle");
  });
});


