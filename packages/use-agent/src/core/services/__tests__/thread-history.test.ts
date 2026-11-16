import { describe, expect, it } from "vitest";
import { ThreadManager } from "../thread-manager.js";
import { formatMessagesToAgentKitHistory } from "../../../utils/message-formatting.js";
import { getToolData } from "../../../utils/type-guards.js";
import type { ConversationMessage } from "../../../types/index.js";

const manager = new ThreadManager();
const tool = (id: string) => ({
  type: "tool",
  id,
  name: "lookup",
  input: { id },
});
const call = (...ids: string[]) => ({
  type: "tool_call",
  role: "assistant",
  stop_reason: "tool",
  tools: ids.map(tool),
});
const text = (content: unknown) => ({
  type: "text",
  role: "assistant",
  content,
});
const result = (id: string, content: unknown) => ({
  type: "tool_result",
  role: "tool_result",
  tool: tool(id),
  content,
  stop_reason: "tool",
});
const restore = (output: unknown[], toolCalls: unknown[] = []) =>
  manager.formatRawHistoryMessages([
    {
      message_id: "stored",
      type: "agent",
      createdAt: "2026-01-01T00:00:00Z",
      data: { output, toolCalls },
    },
  ]);

describe("persisted thread history", () => {
  it("preserves text blocks and assigns unique UI part IDs", () => {
    const messages = restore([
      text("First"),
      text([
        { type: "text", text: "Second" },
        { type: "text", text: "Third" },
      ]),
    ]);
    expect(
      messages[0].parts.map((part) => part.type === "text" && part.content)
    ).toEqual(["First", "Second\nThird"]);
    expect(
      new Set(messages[0].parts.map((part) => "id" in part && part.id)).size
    ).toBe(2);
    expect(formatMessagesToAgentKitHistory(messages)).toEqual([
      text("First\nSecond\nThird"),
    ]);
  });

  it.each([
    null,
    false,
    0,
    "",
    { status: "shipped" },
    { data: { status: "shipped" }, extra: 1 },
  ])(
    "preserves result payload %j on the wire and normalizes UI tool data",
    (content) => {
      const messages = restore([call("a")], [result("a", content)]);
      const part = messages[0].parts[0];
      expect(part.type).toBe("tool-call");
      if (part.type !== "tool-call") throw new Error("Missing tool part");
      expect(part.state).toBe("output-available");
      expect(getToolData(part, "lookup")).toEqual(
        content && typeof content === "object" && "data" in content
          ? content.data
          : content
      );
      expect(formatMessagesToAgentKitHistory(messages)).toEqual([
        call("a"),
        result("a", content),
      ]);
    }
  );

  it("correlates parallel results by ID rather than result-array position", () => {
    const messages = restore(
      [text("Checking"), call("a", "b")],
      [result("b", "B"), result("a", "A")]
    );
    expect(formatMessagesToAgentKitHistory(messages)).toEqual([
      text("Checking"),
      call("a", "b"),
      result("a", "A"),
      result("b", "B"),
    ]);
  });

  it("preserves the order of text and completed tool parts", () => {
    const messages = restore(
      [text("Checking"), call("a"), text("Finished")],
      [result("a", "A")]
    );
    expect(formatMessagesToAgentKitHistory(messages)).toEqual([
      text("Checking"),
      call("a"),
      result("a", "A"),
      text("Finished"),
    ]);
  });

  it("keeps unmatched calls visible without inventing a completed result", () => {
    const messages = restore([call("a")], [result("other", "B")]);
    expect(messages[0].parts[0]).toMatchObject({
      type: "tool-call",
      toolCallId: "a",
      state: "input-available",
    });
    expect(formatMessagesToAgentKitHistory(messages)).toEqual([]);
  });

  it("ignores malformed output and tool entries", () => {
    const messages = restore(
      [
        null,
        {},
        {
          type: "tool_call",
          tools: [null, {}, { id: "bad", name: "bad", input: null }, tool("a")],
        },
      ],
      [null, {}, { tool: null }, result("a", "A")]
    );
    expect(formatMessagesToAgentKitHistory(messages)).toEqual([
      call("a"),
      result("a", "A"),
    ]);
  });

  it("retains live UI result wrappers when no persisted original is present", () => {
    const messages: ConversationMessage[] = [
      {
        id: "live",
        role: "assistant",
        timestamp: new Date(),
        parts: [
          {
            type: "tool-call",
            toolCallId: "a",
            toolName: "lookup",
            input: { id: "a" },
            state: "output-available",
            output: { data: "A" },
          },
        ],
      },
    ];
    expect(formatMessagesToAgentKitHistory(messages)).toEqual([
      call("a"),
      result("a", { data: "A" }),
    ]);
  });
});
