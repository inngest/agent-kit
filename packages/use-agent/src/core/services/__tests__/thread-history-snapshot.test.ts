import { describe, expect, it } from "vitest";
import { ThreadManager } from "../thread-manager.js";
import { reduceStreamingState } from "../streaming-reducer.js";
import type { AgentKitEvent, StreamingState } from "../../../types/index.js";

const tool = { type: "tool", id: "lookup-1", name: "lookup", input: { id: 1 } };
function loaded(): StreamingState {
  return reduceStreamingState(
    { threads: {}, currentThreadId: "t1", lastProcessedIndex: 0, isConnected: false },
    {
      type: "REPLACE_THREAD_MESSAGES", threadId: "t1",
      messages: new ThreadManager().formatRawHistoryMessages([{
        message_id: "saved", type: "agent", data: {
          output: [{ type: "tool_call", role: "assistant", tools: [tool] }],
          toolCalls: [{ type: "tool_result", role: "tool_result", tool, content: { status: "saved" } }],
        },
      }]),
    }
  );
}
function receive(state: StreamingState, sequenceNumber: number, messageId = "saved", partId = "lookup-1") {
  const event: AgentKitEvent = {
    event: "part.created", id: `creation-${sequenceNumber}`, timestamp: 1, sequenceNumber,
    data: { threadId: "t1", messageId, partId, type: "tool-call", metadata: { toolName: "lookup" } },
  };
  return reduceStreamingState(state, { type: "REALTIME_MESSAGES_RECEIVED", messages: [event] });
}

describe("tool creation after saved history", () => {
  it("preserves the entire restored part when creation is replayed repeatedly", () => {
    const before = loaded();
    const saved = structuredClone(before.threads.t1.messages[0].parts);
    const after = receive(receive(before, 0), 1);
    expect(after.threads.t1.messages[0].parts).toEqual(saved);
    expect(before.threads.t1.messages[0].parts).toEqual(saved);
  });

  it("keeps distinct tool IDs and scopes the same call ID to its message", () => {
    const state = receive(receive(loaded(), 0, "saved", "lookup-2"), 1, "other");
    expect(state.threads.t1.messages.map((m) => m.parts.map((p) => p.type === "tool-call" && p.toolCallId)))
      .toEqual([["lookup-1", "lookup-2"], ["lookup-1"]]);
  });

  it("creates a fresh live part after clearing history, even with reused IDs", () => {
    const cleared = reduceStreamingState(loaded(), { type: "CLEAR_THREAD_MESSAGES", threadId: "t1" });
    const state = receive(receive(cleared, 0), 1);
    expect(state.threads.t1.messages[0].parts).toEqual([{
      type: "tool-call", toolCallId: "lookup-1", toolName: "lookup", state: "input-streaming", input: {}, output: undefined,
    }]);
  });

  it("retains a later live completion when creation is replayed again", () => {
    const created = receive(loaded(), 0);
    const completed = reduceStreamingState(created, {
      type: "REALTIME_MESSAGES_RECEIVED", messages: [{
        event: "part.completed", id: "completion", timestamp: 1, sequenceNumber: 1,
        data: { threadId: "t1", messageId: "saved", partId: "lookup-1", type: "tool-output", finalContent: { status: "latest" } },
      }],
    });
    const state = receive(completed, 2);
    expect(state.threads.t1.messages[0].parts).toEqual([{
      type: "tool-call", toolCallId: "lookup-1", toolName: "lookup", state: "output-available", input: { id: 1 }, output: { data: { status: "latest" } },
    }]);
  });
});
