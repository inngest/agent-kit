import { describe, it, expect } from "vitest";
import { reduceStreamingState } from "../../index.js";
import {
  isTextPart,
  isToolCallPart,
  makeEvent,
} from "./test-utils.js";
import type {
  StreamingState,
  StreamingAction,
  ToolManifest,
} from "../../../types/index.js";

type TestManifest = ToolManifest;

function makeState(): StreamingState<TestManifest> {
  return {
    threads: {},
    currentThreadId: "t1",
    lastProcessedIndex: 0,
    isConnected: false,
  } as StreamingState<TestManifest>;
}

describe("reduceStreamingState (hex core seam)", () => {
  it("returns same reference for unknown actions (no behavior change)", () => {
    const state = makeState();
    const action = {
      type: "UNKNOWN_ACTION",
    } as unknown as StreamingAction<TestManifest>;
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
          makeEvent<TestManifest, "run.started">(
            "run.started",
            { threadId: "t1", name: "agent", scope: "agent" },
            { sequenceNumber: 1, id: "e1", timestamp: Date.now() }
          ),
        ],
      },
      false
    );
    expect(state.threads["t1"].agentStatus).toBe("submitted");
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent<TestManifest, "run.completed">(
            "run.completed",
            { threadId: "t1" },
            { sequenceNumber: 2, id: "e2", timestamp: Date.now() }
          ),
        ],
      },
      false
    );
    // With new semantics, run.completed does not set ready; ready occurs on stream.ended
    expect(state.threads["t1"].agentStatus).toBe("submitted");
  });

  it("handles part.created and text.delta", () => {
    let state = makeState();
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent<TestManifest, "part.created">(
            "part.created",
            { threadId: "t1", messageId: "m1", partId: "p1", type: "text" }
          ),
        ],
      },
      false
    );
    expect(state.threads["t1"].messages?.length || 0).toBeGreaterThan(0);

    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent<TestManifest, "text.delta">(
            "text.delta",
            { threadId: "t1", messageId: "m1", partId: "p1", delta: "Hello" }
          ),
        ],
      },
      false
    );
    const msg = state.threads["t1"].messages?.find((m: any) => m.id === "m1");
    const text = msg?.parts?.find(isTextPart);
    expect(text?.content || "").toContain("Hello");
  });

  it("maps connection state values to isConnected", () => {
    let state = makeState();
    state = reduceStreamingState(state, { type: "CONNECTION_STATE_CHANGED", state: "Active" } as any, false);
    expect(state.isConnected).toBe(true);
    state = reduceStreamingState(state, { type: "CONNECTION_STATE_CHANGED", state: 1 } as any, false);
    expect(state.isConnected).toBe(true);
    state = reduceStreamingState(state, { type: "CONNECTION_STATE_CHANGED", state: "weird" } as any, false);
    expect(state.isConnected).toBe(false);
  });

  it("SET_CURRENT_THREAD is a no-op when id is the same, updates when different", () => {
    let state = makeState();
    const prev = state;
    state = reduceStreamingState(state, { type: "SET_CURRENT_THREAD", threadId: "t1" } as any, false);
    expect(state).toBe(prev);
    state = reduceStreamingState(state, { type: "SET_CURRENT_THREAD", threadId: "t2" } as any, false);
    expect(state.currentThreadId).toBe("t2");
  });

  it("MESSAGE_SENT dedupes by messageId and updates agent status", () => {
    let state = makeState();
    state = reduceStreamingState(
      state,
      { type: "MESSAGE_SENT", threadId: "t1", messageId: "m1", message: "hi" } as any,
      false
    );
    const afterFirst = state.threads["t1"].messages?.length || 0;
    state = reduceStreamingState(
      state,
      { type: "MESSAGE_SENT", threadId: "t1", messageId: "m1", message: "hi" } as any,
      false
    );
    const afterSecond = state.threads["t1"].messages?.length || 0;
    expect(afterSecond).toBe(afterFirst);
    expect(state.threads["t1"].agentStatus).toBe("submitted");
  });

  it("SUCCESS and FAILED update the correct message and error state", () => {
    let state = makeState();
    state = reduceStreamingState(state, { type: "MESSAGE_SENT", threadId: "t1", messageId: "m1", message: "hi" } as any, false);
    state = reduceStreamingState(state, { type: "MESSAGE_SEND_SUCCESS", threadId: "t1", messageId: "m1" } as any, false);
    let m = (state.threads["t1"].messages || []).find((x: any) => x.id === "m1");
    expect(m?.status).toBe("sent");

    // Failure on a different message
    state = reduceStreamingState(state, { type: "MESSAGE_SENT", threadId: "t1", messageId: "m2", message: "oops" } as any, false);
    state = reduceStreamingState(state, { type: "MESSAGE_SEND_FAILED", threadId: "t1", messageId: "m2", error: "err" } as any, false);
    m = (state.threads["t1"].messages || []).find((x: any) => x.id === "m2");
    expect(m?.status).toBe("failed");
    expect(state.threads["t1"].agentStatus).toBe("error");
    expect(state.threads["t1"].error?.recoverable).toBe(true);
  });

  it("REPLACE_THREAD_MESSAGES sets historyLoaded, clears error, and idles agent", () => {
    let state = makeState();
    const msgs = [
      { id: "u1", role: "user", parts: [{ type: "text", id: "t", content: "hi", status: "complete" }], timestamp: new Date(), status: "sent" },
    ] as any;
    state = reduceStreamingState(state, { type: "REPLACE_THREAD_MESSAGES", threadId: "t1", messages: msgs } as any, false);
    const t = state.threads["t1"];
    expect(t.historyLoaded).toBe(true);
    expect(t.agentStatus).toBe("ready");
    expect(t.error).toBeUndefined();
  });

  it("CLEAR_THREAD_MESSAGES resets buffer and counters", () => {
    let state = makeState();
    state = reduceStreamingState(state, { type: "REPLACE_THREAD_MESSAGES", threadId: "t1", messages: [] } as any, false);
    state = reduceStreamingState(state, { type: "CLEAR_THREAD_MESSAGES", threadId: "t1" } as any, false);
    const t = state.threads["t1"];
    expect(t.messages.length).toBe(0);
    expect(t.eventBuffer instanceof Map).toBe(true);
    expect(t.nextExpectedSequence).toBe(0);
    expect(t.error).toBeUndefined();
    expect(t.agentStatus).toBe("ready");
  });

  it("CLEAR_THREAD_ERROR clears only error", () => {
    let state = makeState();
    state = reduceStreamingState(state, { type: "MESSAGE_SENT", threadId: "t1", messageId: "m2", message: "oops" } as any, false);
    state = reduceStreamingState(state, { type: "MESSAGE_SEND_FAILED", threadId: "t1", messageId: "m2", error: "err" } as any, false);
    state = reduceStreamingState(state, { type: "CLEAR_THREAD_ERROR", threadId: "t1" } as any, false);
    expect(state.threads["t1"].error).toBeUndefined();
  });

  it("background updates set hasNewMessages for non-current thread", () => {
    let state = makeState();
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          { event: "text.delta", data: { threadId: "t2", messageId: "m1", partId: "p1", delta: "x" }, timestamp: Date.now(), sequenceNumber: 1, id: "e1" } as any,
        ],
      },
      false
    );
    expect(state.threads["t2"].hasNewMessages).toBe(true);
  });

  it("tool_call.arguments.delta merges JSON chunks and concatenates invalid JSON", () => {
    // Valid JSON path
    let state = makeState();
    state = reduceStreamingState(state, { type: "REALTIME_MESSAGES_RECEIVED", messages: [
      makeEvent("part.created", { threadId: "t1", messageId: "m1", partId: "p1", type: "tool-call" }),
      makeEvent("tool_call.arguments.delta", { threadId: "t1", messageId: "m1", partId: "p1", delta: '{"a":1}' }),
      makeEvent("tool_call.arguments.delta", { threadId: "t1", messageId: "m1", partId: "p1", delta: '{"b":2}' }),
    ] } as any, false);
    const msg = state.threads["t1"].messages?.find((m: any) => m.id === "m1");
    const tool = msg?.parts?.find(isToolCallPart);
    expect(tool?.input).toEqual({ a: 1, b: 2 });

    // Invalid JSON path (new tool)
    state = reduceStreamingState(makeState(), { type: "REALTIME_MESSAGES_RECEIVED", messages: [
      makeEvent("part.created", { threadId: "t1", messageId: "m2", partId: "p2", type: "tool-call" }),
      makeEvent("tool_call.arguments.delta", { threadId: "t1", messageId: "m2", partId: "p2", delta: "oops" }),
    ] } as any, false);
    const msg2 = state.threads["t1"].messages?.find((m: any) => m.id === "m2");
    const tool2 = msg2?.parts?.find(isToolCallPart) as any;
    expect(typeof tool2?.input).toBe("string");
  });

  it("part.completed finalizes tool-call input and tool-output output", () => {
    let state = makeState();
    // finalize tool-call input with JSON string
    state = reduceStreamingState(state, { type: "REALTIME_MESSAGES_RECEIVED", messages: [
      makeEvent("part.created", { threadId: "t1", messageId: "m1", partId: "p1", type: "tool-call" }),
      makeEvent("part.completed", { threadId: "t1", messageId: "m1", partId: "p1", type: "tool-call", finalContent: '{"x":1}' }),
    ] } as any, false);
    let msg = state.threads["t1"].messages?.find((m: any) => m.id === "m1");
    let tool = msg?.parts?.find((p: any) => p.type === "tool-call" && p.toolCallId === "p1") as any;
    expect(tool?.input).toEqual({ x: 1 });
    expect(tool?.state).toBe("input-available");

    // tool output path
    state = reduceStreamingState(state, { type: "REALTIME_MESSAGES_RECEIVED", messages: [
      makeEvent("tool_call.output.delta", { threadId: "t1", messageId: "m1", partId: "p1", delta: "hello" }),
      makeEvent("part.completed", { threadId: "t1", messageId: "m1", partId: "p1", type: "tool-output", finalContent: "DONE" }),
    ] } as any, false);
    msg = state.threads["t1"].messages?.find((m: any) => m.id === "m1");
    tool = msg?.parts?.find((p: any) => p.type === "tool-call" && p.toolCallId === "p1") as any;
    expect(tool?.state).toBe("output-available");
    expect(tool?.output).toBe("DONE");
  });

  it("run.completed finalizes executing tools with output; stream.ended idles agent", () => {
    let state = makeState();
    state = reduceStreamingState(state, {
      type: "REALTIME_MESSAGES_RECEIVED",
      messages: [
        { event: "part.created", data: { threadId: "t1", messageId: "m1", partId: "p1", type: "tool-call" }, timestamp: Date.now(), sequenceNumber: 1, id: "e1" } as any,
        { event: "tool_call.output.delta", data: { threadId: "t1", messageId: "m1", partId: "p1", delta: "hello" }, timestamp: Date.now(), sequenceNumber: 2, id: "e2" } as any,
        { event: "run.completed", data: { threadId: "t1" }, timestamp: Date.now(), sequenceNumber: 3, id: "e3" } as any,
      ],
    } as any, false);
    const msg = state.threads["t1"].messages?.find((m: any) => m.id === "m1");
    const tool = msg?.parts?.find(isToolCallPart) as any;
    expect(tool?.state).toBe("output-available");
    // After run.completed we no longer set ready; append stream.ended to idle the agent
    state = reduceStreamingState(state, { type: "REALTIME_MESSAGES_RECEIVED", messages: [makeEvent("stream.ended", { threadId: "t1", scope: "network" })] } as any, false);
    expect(state.threads["t1"].agentStatus).toBe("ready");
  });

  it("epoch reset on network run.started sets nextExpectedSequence to s+1 and purges <= s", () => {
    let state = makeState();
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent("run.started", { threadId: "t1", name: "net", scope: "network" } as any, {
            sequenceNumber: 0,
            id: "r0",
          } as any),
        ] as any,
      } as any,
      false
    );
    const t = state.threads["t1"] as any;
    expect(t.agentStatus).toBe("submitted");
    expect(t.runActive).toBe(true);
    expect(t.nextExpectedSequence).toBe(1);
    expect(t.eventBuffer.has(0)).toBe(false);

    // Now send in-order events 1,2 and ensure they apply
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent(
            "part.created",
            { threadId: "t1", messageId: "m1", partId: "p1", type: "text" } as any,
            { sequenceNumber: 1, id: "e1" } as any
          ),
          makeEvent(
            "text.delta",
            { threadId: "t1", messageId: "m1", partId: "p1", delta: "Hello" } as any,
            { sequenceNumber: 2, id: "e2" } as any
          ),
        ] as any,
      } as any,
      false
    );
    const msg = state.threads["t1"].messages?.find((m: any) => m.id === "m1");
    const text = msg?.parts?.find(isTextPart);
    expect(text?.content || "").toContain("Hello");
  });

  it("agent sub-run with parentRunId does not reset epoch (no jump)", () => {
    let state = makeState();
    // Start network epoch
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent("run.started", { threadId: "t1", name: "net", scope: "network" } as any, {
            sequenceNumber: 0,
            id: "r0",
          } as any),
        ] as any,
      } as any,
      false
    );
    // Buffer a valid next event and an agent sub-run at a higher seq
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent(
            "part.created",
            { threadId: "t1", messageId: "m2", partId: "p2", type: "text" } as any,
            { sequenceNumber: 1, id: "pc1" } as any
          ),
          makeEvent(
            "run.started",
            { threadId: "t1", name: "agentA", scope: "agent", parentRunId: "net-1" } as any,
            { sequenceNumber: 10, id: "a10" } as any
          ),
        ] as any,
      } as any,
      false
    );
    const t = state.threads["t1"] as any;
    // Should have applied seq 1 and advanced only to 2; not jumped to 11
    expect(t.nextExpectedSequence).toBe(2);
    const msg = t.messages?.find((m: any) => m.id === "m2");
    const text = msg?.parts?.find(isTextPart);
    expect(Boolean(text)).toBe(true);
  });

  it("standalone agent run (no parentRunId) resets epoch on agent run.started", () => {
    let state = makeState();
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent(
            "run.started",
            { threadId: "tX", name: "solo-agent", scope: "agent" } as any,
            { sequenceNumber: 0, id: "solo0" } as any
          ),
        ] as any,
      } as any,
      false
    );
    const t = state.threads["tX"] as any;
    expect(t.runActive).toBe(true);
    expect(t.agentStatus).toBe("submitted");
    expect(t.nextExpectedSequence).toBe(1);
  });

  it("purges prior-epoch buffered events on network run.started and doesn't regress state", () => {
    let state = makeState();
    // Buffer some late events from a prior epoch (simulate seq 5 text before run start)
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          // Note: don't align to a delta pre-epoch; keep it buffered
          makeEvent(
            "text.delta",
            { threadId: "tZ", messageId: "mZ", partId: "pZ", delta: "late" } as any,
            { sequenceNumber: 5, id: "late5" } as any
          ),
        ] as any,
      } as any,
      false
    );
    // Start new network epoch at seq 0 → reset to s+1 = 1 and purge <= 0; late seq 5 remains buffered but won't apply until gap fills
    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent("run.started", { threadId: "tZ", name: "net", scope: "network" } as any, {
            sequenceNumber: 0,
            id: "nz0",
          } as any),
        ] as any,
      } as any,
      false
    );
    const t = state.threads["tZ"] as any;
    expect(t.nextExpectedSequence).toBe(1);
    // Now send seq 1 and ensure only then text applies; we assert text isn't present before
    let msg = t.messages?.find((m: any) => m.id === "mZ");
    let text = msg?.parts?.find(isTextPart);
    // We may have created a part if a prior part.created existed; if not, text should be undefined
    if (text) {
      expect(text.content || "").not.toContain("late");
    } else {
      expect(text).toBeUndefined();
    }

    state = reduceStreamingState(
      state,
      {
        type: "REALTIME_MESSAGES_RECEIVED",
        messages: [
          makeEvent(
            "part.created",
            { threadId: "tZ", messageId: "mZ", partId: "pZ", type: "text" } as any,
            { sequenceNumber: 1, id: "pc1z" } as any
          ),
          makeEvent(
            "text.delta",
            { threadId: "tZ", messageId: "mZ", partId: "pZ", delta: "ok" } as any,
            { sequenceNumber: 2, id: "td2z" } as any
          ),
        ] as any,
      } as any,
      false
    );
    msg = state.threads["tZ"].messages?.find((m: any) => m.id === "mZ");
    text = msg?.parts?.find(isTextPart);
    expect(text?.content || "").toContain("ok");
  });
});


