import { describe, it, expect } from "vitest";
import { reduceStreamingState } from "../../index.js";
import { makeEvent, isTextPart, isToolCallPart } from "./test-utils.js";
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
          { event: "run.started", data: { threadId: "t1", name: "agent" }, timestamp: Date.now(), sequenceNumber: 1, id: "e1" } as any,
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
          { event: "run.completed", data: { threadId: "t1" }, timestamp: Date.now(), sequenceNumber: 2, id: "e2" } as any,
        ] as any,
      },
      false
    );
    expect(state.threads["t1"].agentStatus).toBe("idle");
  });

  it("handles part.created and text.delta", () => {
    let state = makeState();
    state = reduceStreamingState(state, { type: "REALTIME_MESSAGES_RECEIVED", messages: [makeEvent("part.created", { threadId: "t1", messageId: "m1", partId: "p1", type: "text" })] } as any, false);
    expect(state.threads["t1"].messages?.length || 0).toBeGreaterThan(0);

    state = reduceStreamingState(state, { type: "REALTIME_MESSAGES_RECEIVED", messages: [makeEvent("text.delta", { threadId: "t1", messageId: "m1", partId: "p1", delta: "Hello" })] } as any, false);
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
    expect(state.threads["t1"].agentStatus).toBe("thinking");
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
    expect(t.agentStatus).toBe("idle");
    expect(t.error).toBeUndefined();
  });

  it("CLEAR_THREAD_MESSAGES resets buffer and counters", () => {
    let state = makeState();
    state = reduceStreamingState(state, { type: "REPLACE_THREAD_MESSAGES", threadId: "t1", messages: [] } as any, false);
    state = reduceStreamingState(state, { type: "CLEAR_THREAD_MESSAGES", threadId: "t1" } as any, false);
    const t = state.threads["t1"];
    expect(t.messages.length).toBe(0);
    expect(t.eventBuffer instanceof Map).toBe(true);
    expect(t.nextExpectedSequence).toBeNull();
    expect(t.lastProcessedSequence).toBe(0);
    expect(t.error).toBeUndefined();
    expect(t.agentStatus).toBe("idle");
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

  it("run.completed finalizes executing tools with output and idles agent", () => {
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
    expect(state.threads["t1"].agentStatus).toBe("idle");
  });
});


