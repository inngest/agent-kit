import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  messagesToCoreMessages,
  resultToMessages,
  toolsToAiTools,
  mapToolChoice,
  type SerializableResult,
} from "./converters";
import type { Message } from "./types";
import type { Tool } from "./tool";

describe("messagesToCoreMessages", () => {
  it("converts a system text message", () => {
    const messages: Message[] = [
      { type: "text", role: "system", content: "You are helpful." },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toEqual([{ role: "system", content: "You are helpful." }]);
  });

  it("converts a user text message", () => {
    const messages: Message[] = [
      { type: "text", role: "user", content: "Hello" },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("converts an assistant text message", () => {
    const messages: Message[] = [
      { type: "text", role: "assistant", content: "Hi there" },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toEqual([{ role: "assistant", content: "Hi there" }]);
  });

  it("converts array content to joined string", () => {
    const messages: Message[] = [
      {
        type: "text",
        role: "user",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toEqual([{ role: "user", content: "Hello world" }]);
  });

  it("handles empty array content", () => {
    const messages: Message[] = [
      { type: "text", role: "user", content: [] },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toEqual([{ role: "user", content: "" }]);
  });

  it("converts a tool_call message to assistant with tool-call parts", () => {
    const messages: Message[] = [
      {
        type: "tool_call",
        role: "assistant",
        stop_reason: "tool",
        tools: [
          {
            type: "tool",
            id: "call_1",
            name: "get_weather",
            input: { city: "London" },
          },
        ],
      },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "get_weather",
            args: { city: "London" },
          },
        ],
      },
    ]);
  });

  it("converts multiple tool calls in a single message", () => {
    const messages: Message[] = [
      {
        type: "tool_call",
        role: "assistant",
        stop_reason: "tool",
        tools: [
          { type: "tool", id: "call_1", name: "tool_a", input: { x: 1 } },
          { type: "tool", id: "call_2", name: "tool_b", input: { y: 2 } },
        ],
      },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("assistant");
    const content = (result[0] as { role: string; content: unknown[] }).content;
    expect(content).toHaveLength(2);
  });

  it("converts a tool_result message to tool role", () => {
    const messages: Message[] = [
      {
        type: "tool_result",
        role: "tool_result",
        tool: {
          type: "tool",
          id: "call_1",
          name: "get_weather",
          input: { city: "London" },
        },
        content: { temperature: 20 },
        stop_reason: "tool",
      },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather",
            result: { temperature: 20 },
          },
        ],
      },
    ]);
  });

  it("converts a mixed conversation", () => {
    const messages: Message[] = [
      { type: "text", role: "system", content: "System prompt" },
      { type: "text", role: "user", content: "What's the weather?" },
      {
        type: "tool_call",
        role: "assistant",
        stop_reason: "tool",
        tools: [
          { type: "tool", id: "c1", name: "weather", input: { city: "NYC" } },
        ],
      },
      {
        type: "tool_result",
        role: "tool_result",
        tool: { type: "tool", id: "c1", name: "weather", input: { city: "NYC" } },
        content: "Sunny, 75F",
        stop_reason: "tool",
      },
      { type: "text", role: "assistant", content: "It's sunny and 75F in NYC." },
    ];
    const result = messagesToCoreMessages(messages);
    expect(result).toHaveLength(5);
    expect(result[0]!.role).toBe("system");
    expect(result[1]!.role).toBe("user");
    expect(result[2]!.role).toBe("assistant");
    expect(result[3]!.role).toBe("tool");
    expect(result[4]!.role).toBe("assistant");
  });

  it("returns empty array for empty input", () => {
    expect(messagesToCoreMessages([])).toEqual([]);
  });
});

describe("resultToMessages", () => {
  it("converts text-only response", () => {
    const result: SerializableResult = {
      text: "Hello world",
      toolCalls: [],
      finishReason: "stop",
    };
    const messages = resultToMessages(result);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: "text",
      role: "assistant",
      content: "Hello world",
      stop_reason: "stop",
    });
  });

  it("converts tool-call-only response (no text)", () => {
    const result: SerializableResult = {
      text: "",
      toolCalls: [
        { toolCallId: "c1", toolName: "search", args: { q: "test" } },
      ],
      finishReason: "tool-calls",
    };
    const messages = resultToMessages(result);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe("tool_call");
    if (messages[0]!.type === "tool_call") {
      expect(messages[0]!.tools).toHaveLength(1);
      expect(messages[0]!.tools[0]!.id).toBe("c1");
      expect(messages[0]!.tools[0]!.name).toBe("search");
    }
  });

  it("converts response with both text and tool calls", () => {
    const result: SerializableResult = {
      text: "Let me search for that.",
      toolCalls: [
        { toolCallId: "c1", toolName: "search", args: { q: "test" } },
      ],
      finishReason: "tool-calls",
    };
    const messages = resultToMessages(result);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.type).toBe("text");
    if (messages[0]!.type === "text") {
      expect(messages[0]!.stop_reason).toBe("tool");
    }
    expect(messages[1]!.type).toBe("tool_call");
  });

  it("returns empty text message when no text and no tool calls", () => {
    const result: SerializableResult = {
      text: "",
      toolCalls: [],
      finishReason: "stop",
    };
    const messages = resultToMessages(result);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: "text",
      role: "assistant",
      content: "",
      stop_reason: "stop",
    });
  });

  it("treats whitespace-only text as empty", () => {
    const result: SerializableResult = {
      text: "   \n  ",
      toolCalls: [],
      finishReason: "stop",
    };
    const messages = resultToMessages(result);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe("text");
    if (messages[0]!.type === "text") {
      // Whitespace-only text is treated as empty, so fallback empty message
      expect(messages[0]!.content).toBe("");
    }
  });

  it("maps multiple tool calls", () => {
    const result: SerializableResult = {
      text: "",
      toolCalls: [
        { toolCallId: "c1", toolName: "tool_a", args: { x: 1 } },
        { toolCallId: "c2", toolName: "tool_b", args: { y: 2 } },
      ],
      finishReason: "tool-calls",
    };
    const messages = resultToMessages(result);
    expect(messages).toHaveLength(1);
    if (messages[0]!.type === "tool_call") {
      expect(messages[0]!.tools).toHaveLength(2);
      expect(messages[0]!.tools[0]!.name).toBe("tool_a");
      expect(messages[0]!.tools[1]!.name).toBe("tool_b");
    }
  });
});

describe("toolsToAiTools", () => {
  it("converts a tool with zod parameters", () => {
    const tools: Tool.Any[] = [
      {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: z.object({ city: z.string() }),
        handler: async () => "sunny",
      },
    ];
    const result = toolsToAiTools(tools);
    expect(result).toHaveProperty("get_weather");
    expect(result["get_weather"]!.description).toBe("Get weather for a city");
    // The parameters should be a JSON schema wrapper
    expect(result["get_weather"]!.parameters).toBeDefined();
  });

  it("converts a tool without parameters to empty object schema", () => {
    const tools: Tool.Any[] = [
      {
        name: "ping",
        description: "Ping",
        handler: async () => "pong",
      },
    ];
    const result = toolsToAiTools(tools);
    expect(result).toHaveProperty("ping");
    expect(result["ping"]!.parameters).toBeDefined();
  });

  it("converts multiple tools", () => {
    const tools: Tool.Any[] = [
      {
        name: "tool_a",
        description: "A",
        parameters: z.object({ x: z.number() }),
        handler: async () => {},
      },
      {
        name: "tool_b",
        description: "B",
        parameters: z.object({ y: z.string() }),
        handler: async () => {},
      },
    ];
    const result = toolsToAiTools(tools);
    expect(Object.keys(result)).toEqual(["tool_a", "tool_b"]);
  });

  it("returns empty object for empty tools array", () => {
    const result = toolsToAiTools([]);
    expect(result).toEqual({});
  });
});

describe("mapToolChoice", () => {
  it("maps 'auto' to 'auto'", () => {
    expect(mapToolChoice("auto")).toBe("auto");
  });

  it("maps 'any' to 'required'", () => {
    expect(mapToolChoice("any")).toBe("required");
  });

  it("maps a specific tool name to tool object", () => {
    expect(mapToolChoice("get_weather")).toEqual({
      type: "tool",
      toolName: "get_weather",
    });
  });

  it("maps an arbitrary string to tool object", () => {
    expect(mapToolChoice("my_custom_tool")).toEqual({
      type: "tool",
      toolName: "my_custom_tool",
    });
  });
});
