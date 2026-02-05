import { describe, expect, test } from "vitest";
import { responseParser, requestParser } from "./anthropic";
import type { Message, ReasoningMessage } from "../types";

describe("anthropic responseParser", () => {
  test("should extract thinking blocks as ReasoningMessage with signature", () => {
    const input = {
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking: "Let me reason through this carefully...",
          signature: "sig_abc123",
        },
        {
          type: "text",
          text: "The answer is 42.",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      type: "reasoning",
      role: "assistant",
      content: "Let me reason through this carefully...",
      signature: "sig_abc123",
    });

    expect(result[1]).toEqual({
      type: "text",
      role: "assistant",
      content: "The answer is 42.",
      stop_reason: "stop",
    });
  });

  test("should handle thinking block without signature", () => {
    const input = {
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking: "Some reasoning...",
        },
        {
          type: "text",
          text: "Result.",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(2);

    const reasoning = result[0] as ReasoningMessage;
    expect(reasoning.type).toBe("reasoning");
    expect(reasoning.content).toBe("Some reasoning...");
    expect(reasoning.signature).toBeUndefined();
  });

  test("should handle thinking block with tool_use", () => {
    const input = {
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking: "I need to use a tool.",
          signature: "sig_xyz",
        },
        {
          type: "tool_use",
          id: "tool_1",
          name: "search",
          input: { query: "test" },
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(2);

    expect(result[0]!.type).toBe("reasoning");
    expect(result[1]!.type).toBe("tool_call");
  });

  test("should handle response without thinking blocks (backward compat)", () => {
    const input = {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Normal response.",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "text",
      role: "assistant",
      content: "Normal response.",
      stop_reason: "stop",
    });
  });
});

describe("anthropic requestParser", () => {
  const mockModel = {
    options: {
      model: "claude-sonnet-4-5-20250929",
      defaultParameters: { max_tokens: 1024 },
    },
  } as never;

  test("should filter out reasoning messages from request", () => {
    const messages: Message[] = [
      { type: "text", role: "system", content: "You are helpful." },
      { type: "text", role: "user", content: "What is 2+2?" },
      {
        type: "reasoning",
        role: "assistant",
        content: "Let me think...",
        signature: "sig_abc",
      },
      { type: "text", role: "assistant", content: "4" },
    ];

    const result = requestParser(mockModel, messages, [], "auto");

    // System is extracted to top-level, remaining: user + assistant (reasoning skipped)
    expect(result.system).toBe("You are helpful.");
    const outMessages = result.messages as Array<{ role: string }>;
    expect(outMessages).toHaveLength(2);
    expect(outMessages[0]!.role).toBe("user");
    // The last assistant message gets patched to "user" by Anthropic adapter
    expect(outMessages[1]!.role).toBe("user");
  });
});
