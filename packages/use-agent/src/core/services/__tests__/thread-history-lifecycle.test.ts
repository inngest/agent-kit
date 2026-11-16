import { describe, expect, it } from "vitest";
import { ThreadManager } from "../thread-manager.js";
import { reduceStreamingState } from "../streaming-reducer.js";
import { DefaultHttpTransport } from "../../adapters/http-transport.js";
import { formatMessagesToAgentKitHistory } from "../../../utils/message-formatting.js";
import { getToolData } from "../../../utils/type-guards.js";
import type { AgentKitEvent, StreamingState } from "../../../types/index.js";

function makeEvent<E extends AgentKitEvent["event"]>(
  event: E,
  data: Extract<AgentKitEvent, { event: E }>["data"],
  extras: { sequenceNumber: number }
): AgentKitEvent {
  return { event, data, id: event, timestamp: 1, ...extras } as AgentKitEvent;
}

function loadedState(content: unknown = "saved"): StreamingState {
  const tool = { type: "tool", id: "lookup-1", name: "lookup", input: {} };
  const messages = new ThreadManager().formatRawHistoryMessages([
    {
      message_id: "stored-message",
      type: "agent",
      createdAt: "2026-01-01T00:00:00Z",
      data: {
        output: [{ type: "tool_call", role: "assistant", tools: [tool] }],
        toolCalls: [
          { type: "tool_result", role: "tool_result", tool, content },
        ],
      },
    },
  ]);
  return reduceStreamingState(
    {
      threads: {},
      currentThreadId: "thread-1",
      lastProcessedIndex: 0,
      isConnected: false,
    },
    { type: "REPLACE_THREAD_MESSAGES", threadId: "thread-1", messages }
  );
}

function receive(state: StreamingState, ...messages: AgentKitEvent[]) {
  return reduceStreamingState(state, {
    type: "REALTIME_MESSAGES_RECEIVED",
    messages,
  });
}

function completion(content: unknown, sequenceNumber = 0) {
  return makeEvent(
    "part.completed",
    {
      threadId: "thread-1",
      messageId: "stored-message",
      partId: "lookup-1",
      type: "tool-output",
      finalContent: content,
    },
    { sequenceNumber }
  );
}

function delta() {
  return makeEvent(
    "tool_call.output.delta",
    {
      threadId: "thread-1",
      messageId: "stored-message",
      partId: "lookup-1",
      delta: " updated",
    },
    { sequenceNumber: 0 }
  );
}

async function expectWire(
  state: StreamingState,
  content: unknown,
  uiData: unknown
) {
  const messages = state.threads["thread-1"].messages;
  const part = messages[0].parts[0];
  if (part.type !== "tool-call") throw new Error("Missing tool part");
  expect(getToolData(part, "lookup")).toEqual(uiData);
  const history = formatMessagesToAgentKitHistory(messages);
  expect(
    history.find((message) => message.type === "tool_result")?.content
  ).toEqual(content);
  let body: { history: { type: string; content?: unknown }[] } | undefined;
  const transport = new DefaultHttpTransport({
    baseURL: "https://sdk-local.invalid",
    fetch: async (_url, options) => {
      body = JSON.parse(options!.body as string) as typeof body;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });
  await transport.sendMessage({
    threadId: "thread-1",
    userMessage: { id: "next", role: "user", content: "continue" },
    history,
  });
  expect(
    body?.history.find((message) => message.type === "tool_result")?.content
  ).toEqual(content);
}

describe("persisted tool output after live updates", () => {
  it.each([
    null,
    false,
    0,
    "",
    { status: "shipped" },
    { data: { status: "shipped" }, extra: 1 },
  ])(
    "sends the live completion %j through the codec and actual HTTP serializer",
    async (content) => {
      const state = receive(loadedState(), completion(content));
      const wrapped =
        content && typeof content === "object" && "data" in content
          ? content
          : { data: content };
      await expectWire(state, wrapped, wrapped.data);
    }
  );

  it.each(["run.completed", "stream.ended"] as const)(
    "sends accumulated live deltas after %s finalization",
    async (event) => {
      const state = receive(
        loadedState(),
        delta(),
        makeEvent(event, { threadId: "thread-1" }, { sequenceNumber: 1 })
      );
      await expectWire(state, { data: "saved updated" }, "saved updated");
    }
  );

  it("lets a final completion replace accumulated deltas", async () => {
    const state = receive(
      loadedState(),
      delta(),
      completion({ status: "shipped" }, 1)
    );
    await expectWire(
      state,
      { data: { status: "shipped" } },
      { status: "shipped" }
    );
  });

  it("retains an unchanged persisted result across terminal events", async () => {
    const state = receive(
      loadedState(false),
      makeEvent("stream.ended", { threadId: "thread-1" }, { sequenceNumber: 0 })
    );
    await expectWire(state, false, false);
  });

  it("retains persisted output when only a different tool changes", async () => {
    const state = receive(
      loadedState(null),
      makeEvent(
        "part.completed",
        {
          threadId: "thread-1",
          messageId: "other-message",
          partId: "other-tool",
          type: "tool-output",
          finalContent: "unrelated",
        },
        { sequenceNumber: 0 }
      )
    );
    await expectWire(state, null, null);
  });
});
