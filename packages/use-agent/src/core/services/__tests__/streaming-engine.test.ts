import { describe, it, expect } from "vitest";
import { StreamingEngine } from "../../index.js";
import type { IConnection } from "../../ports/connection.js";
import { makeEvent, makeConnectionMock } from "./test-utils.js";
import type { ToolManifest } from "../../../types/index.js";

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

  it("notifies listeners only on reference change", () => {
    const engine = new StreamingEngine({ initialState: makeInitial(), debug: false });
    let notified = 0;
    const unsub = engine.subscribe(() => notified++);
    engine.dispatch({ type: "UNKNOWN" } as any);
    expect(notified).toBe(0);
    // Cause a change
    engine.dispatch({ type: "SET_CURRENT_THREAD", threadId: "t2" } as any);
    expect(notified).toBe(1);
    unsub();
  });

  it("wires subscribeWithConnection and teardown", async () => {
    const messages: any[] = [];
    const states: any[] = [];
    const engine = new StreamingEngine({ initialState: makeInitial(), debug: false });
    const conn = makeConnectionMock(async ({ onMessage, onStateChange }) => {
      onStateChange?.("Active");
      onMessage(
        makeEvent<ToolManifest, "run.started">("run.started", {
          threadId: "t1",
        })
      );
      return { unsubscribe: () => { states.push("unsubscribed"); } } as any;
    });
    await engine.subscribeWithConnection(conn, {
      channel: "ch",
      onMessage: (c) => messages.push(c),
      onStateChange: (s) => states.push(s),
    });
    expect(states[0]).toBe("Active");
    expect(messages.length).toBe(1);
    engine.teardown();
    expect(states.includes("unsubscribed")).toBe(true);
  });
});


