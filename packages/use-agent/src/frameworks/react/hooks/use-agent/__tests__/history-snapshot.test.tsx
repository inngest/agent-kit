/* @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import "../../../../../__tests__/utils/broadcast-channel.ts";
import "../../../../../__tests__/utils/inngest-hook-mock.ts";
import { useAgents } from "../../../../../index.js";
import type { IClientTransport } from "../../../../../core/ports/transport.js";

const peers: BroadcastChannel[] = [];
afterEach(() => { cleanup(); peers.splice(0).forEach((peer) => peer.close()); });

it("replays a peer snapshot after useAgents loads saved tools, then accepts live output", async () => {
  const tool = { type: "tool", id: "lookup-1", name: "lookup", input: { id: 1 } };
  const stored = [{ message_id: "saved", type: "agent", data: {
    output: [{ type: "tool_call", role: "assistant", tools: [tool] }],
    toolCalls: [{ type: "tool_result", role: "tool_result", tool, content: { status: "saved" } }],
  } }];
  const fetchHistory = vi.fn(async () => stored);
  const sendMessage = vi.fn(async () => ({ success: true, threadId: "t1" }));
  const transport: IClientTransport = {
    sendMessage, fetchHistory,
    fetchThreads: async () => ({ threads: [], hasMore: false, total: 0 }),
    getRealtimeToken: async () => { throw new Error("No realtime connection in offline snapshot test"); },
    createThread: async () => ({ threadId: "t1", title: "Local" }),
    deleteThread: async () => {}, approveToolCall: async () => {},
  };
  const { result } = renderHook(() => useAgents({ transport, channelKey: "history-snapshot", initialThreadId: "t1", debug: false }));
  await act(async () => { await result.current.switchToThread("t1"); });
  expect(fetchHistory).toHaveBeenCalledWith({ threadId: "t1" });
  const restored = structuredClone(result.current.messages[0].parts);
  const peer = new BroadcastChannel("agentkit-stream:history-snapshot");
  peers.push(peer);
  const creation = {
    event: "part.created", id: "peer-creation", timestamp: 1, sequenceNumber: 0,
    data: { threadId: "t1", messageId: "saved", partId: "lookup-1", type: "tool-call", metadata: { toolName: "lookup" } },
  };
  await act(async () => {
    peer.postMessage({ type: "snapshot:response", sender: "peer-tab", threadId: "t1", events: [creation] });
  });
  // A later peer event acknowledges delivery after the snapshot on the same channel.
  await act(async () => {
    peer.postMessage({ type: "evt", sender: "peer-tab", evt: {
      event: "run.started", id: "snapshot-received", timestamp: 2, sequenceNumber: 1,
      data: { threadId: "t1" },
    } });
  });
  await waitFor(() => expect(result.current.status).toBe("submitted"));
  expect(result.current.messages[0].parts).toEqual(restored);

  await act(async () => {
    peer.postMessage({ type: "evt", sender: "peer-tab", evt: {
      event: "part.completed", id: "peer-completion", timestamp: 3, sequenceNumber: 2,
      data: { threadId: "t1", messageId: "saved", partId: "lookup-1", type: "tool-output", finalContent: { status: "latest" } },
    } });
  });
  await waitFor(() => expect(result.current.messages[0].parts).toEqual([{
    type: "tool-call", toolCallId: "lookup-1", toolName: "lookup", state: "output-available", input: { id: 1 }, output: { data: { status: "latest" } },
  }]));
  await act(async () => { await result.current.sendMessage("continue", { messageId: "next" }); });
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    history: [
      { type: "tool_call", role: "assistant", tools: [tool], stop_reason: "tool" },
      { type: "tool_result", role: "tool_result", tool, content: { data: { status: "latest" } }, stop_reason: "tool" },
      { type: "text", role: "user", content: "continue" },
    ],
  }));
});
