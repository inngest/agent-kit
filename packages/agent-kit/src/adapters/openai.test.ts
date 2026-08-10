import { describe, expect, test } from "vitest";
import {
  responseParser,
  requestParser,
  isDeepSeekModel,
  isReasoningModel,
} from "./openai";
import type { Message, ReasoningMessage } from "../types";

describe("openai responseParser", () => {
  test("should extract reasoning_content and text from a response", () => {
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "The answer is 42.",
            reasoning_content: "Let me think about this step by step...",
          },
          finish_reason: "stop",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      type: "reasoning",
      role: "assistant",
      content: "Let me think about this step by step...",
    });

    expect(result[1]).toEqual({
      type: "text",
      role: "assistant",
      content: "The answer is 42.",
      stop_reason: "stop",
    });
  });

  test("should handle reasoning-only response (no text content)", () => {
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            reasoning_content: "Deep reasoning here...",
          },
          finish_reason: "stop",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "reasoning",
      role: "assistant",
      content: "Deep reasoning here...",
    });
  });

  test("should not create reasoning message when reasoning_content is empty", () => {
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hello!",
            reasoning_content: "   ",
          },
          finish_reason: "stop",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("text");
  });

  test("should handle response without reasoning_content (backward compat)", () => {
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "Just a normal response.",
          },
          finish_reason: "stop",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "text",
      role: "assistant",
      content: "Just a normal response.",
      stop_reason: "stop",
    });
  });

  test("should handle reasoning_content with tool calls", () => {
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            reasoning_content: "I need to call a tool to get the data.",
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: {
                  name: "get_data",
                  arguments: '{"query": "test"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result).toHaveLength(2);

    expect(result[0]!.type).toBe("reasoning");
    expect((result[0] as ReasoningMessage).content).toBe(
      "I need to call a tool to get the data."
    );

    expect(result[1]!.type).toBe("tool_call");
  });
});

describe("openai requestParser", () => {
  const mockModel = {
    options: { model: "gpt-4" },
  } as never;

  const deepSeekModel = {
    options: { model: "deepseek-v4-flash" },
  } as never;

  test("should filter out reasoning messages from request", () => {
    const messages: Message[] = [
      { type: "text", role: "system", content: "You are helpful." },
      { type: "text", role: "user", content: "What is 2+2?" },
      { type: "reasoning", role: "assistant", content: "Let me think..." },
      { type: "text", role: "assistant", content: "4" },
    ];

    const result = requestParser(mockModel, messages, [], "auto");
    const outMessages = result.messages as Array<{
      role: string;
      content: string;
      reasoning_content?: string;
    }>;

    expect(outMessages).toHaveLength(3);
    expect(outMessages[0]!.role).toBe("system");
    expect(outMessages[1]!.role).toBe("user");
    expect(outMessages[2]!.role).toBe("assistant");
    expect(outMessages[2]!.content).toBe("4");
    expect(outMessages[2]!.reasoning_content).toBeUndefined();
  });

  test("should include reasoning_content in DeepSeek assistant text", () => {
    const messages: Message[] = [
      { type: "text", role: "user", content: "What is 2+2?" },
      { type: "reasoning", role: "assistant", content: "Let me think..." },
      { type: "text", role: "assistant", content: "4" },
    ];

    const result = requestParser(deepSeekModel, messages, [], "auto");
    const outMessages = result.messages as Array<{
      role: string;
      content: string;
      reasoning_content?: string;
    }>;

    expect(outMessages).toHaveLength(2);
    expect(outMessages[1]).toEqual({
      role: "assistant",
      content: "4",
      reasoning_content: "Let me think...",
    });
  });

  test("should round-trip DeepSeek reasoning_content with a tool call", () => {
    const response = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            reasoning_content: "I should fetch the data.",
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: {
                  name: "get_data",
                  arguments: '{"query":"test"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };
    const parsedResponse = responseParser(response as never);
    const messages: Message[] = [
      { type: "text", role: "user", content: "Get me data" },
      ...parsedResponse,
      {
        type: "tool_result",
        role: "tool_result",
        tool: {
          type: "tool",
          id: "call_123",
          name: "get_data",
          input: { query: "test" },
        },
        content: "result",
        stop_reason: "tool",
      },
    ];

    const request = requestParser(deepSeekModel, messages, [], "auto");
    const outMessages = request.messages as Array<{
      role: string;
      content: string | null;
      reasoning_content?: string;
      tool_calls?: unknown[];
      tool_call_id?: string;
    }>;

    expect(outMessages).toHaveLength(3);
    expect(outMessages[1]).toMatchObject({
      role: "assistant",
      content: null,
      reasoning_content: "I should fetch the data.",
    });
    expect(outMessages[1]!.tool_calls).toHaveLength(1);
    expect(outMessages[2]).toEqual({
      role: "tool",
      tool_call_id: "call_123",
      content: "result",
    });
  });

  test("should drop orphaned DeepSeek reasoning without an assistant message", () => {
    const messages: Message[] = [
      { type: "text", role: "user", content: "Hello" },
      { type: "reasoning", role: "assistant", content: "Thinking..." },
    ];

    const result = requestParser(deepSeekModel, messages, [], "auto");

    expect(result.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  test("should not set parallel_tool_calls for reasoning models", () => {
    const o3Model = {
      options: { model: "o3-mini" },
    } as never;

    const tools = [
      {
        name: "test_tool",
        description: "A test tool",
        handler: () => "result",
      },
    ];

    const result = requestParser(o3Model, [], tools, "auto");
    expect(result.parallel_tool_calls).toBeUndefined();
  });

  test("should set parallel_tool_calls=false for non-reasoning models", () => {
    const gpt4Model = {
      options: { model: "gpt-4o" },
    } as never;

    const tools = [
      {
        name: "test_tool",
        description: "A test tool",
        handler: () => "result",
      },
    ];

    const result = requestParser(gpt4Model, [], tools, "auto");
    expect(result.parallel_tool_calls).toBe(false);
  });
});

describe("isReasoningModel", () => {
  test("should detect o-series models", () => {
    expect(isReasoningModel("o1")).toBe(true);
    expect(isReasoningModel("o1-mini")).toBe(true);
    expect(isReasoningModel("o1-preview")).toBe(true);
    expect(isReasoningModel("o3")).toBe(true);
    expect(isReasoningModel("o3-mini")).toBe(true);
    expect(isReasoningModel("o4-mini")).toBe(true);
  });

  test("should detect gpt reasoning variants", () => {
    expect(isReasoningModel("gpt-5-pro")).toBe(true);
    expect(isReasoningModel("gpt-5.1-pro")).toBe(true);
    expect(isReasoningModel("gpt-5.1-codex")).toBe(true);
  });

  test("should not detect regular models as reasoning", () => {
    expect(isReasoningModel("gpt-4")).toBe(false);
    expect(isReasoningModel("gpt-4o")).toBe(false);
    expect(isReasoningModel("gpt-4o-mini")).toBe(false);
    expect(isReasoningModel("gpt-4-turbo")).toBe(false);
  });

  test("should handle undefined and empty string", () => {
    expect(isReasoningModel(undefined)).toBe(false);
    expect(isReasoningModel("")).toBe(false);
  });

  test("should be case insensitive", () => {
    expect(isReasoningModel("O3-Mini")).toBe(true);
    expect(isReasoningModel("GPT-5-PRO")).toBe(true);
  });
});

describe("isDeepSeekModel", () => {
  test("should detect DeepSeek model names", () => {
    expect(isDeepSeekModel("deepseek-v4-flash")).toBe(true);
    expect(isDeepSeekModel("deepseek-v4-pro")).toBe(true);
    expect(isDeepSeekModel("provider/deepseek-reasoner")).toBe(true);
    expect(isDeepSeekModel("DEEPSEEK-V4-FLASH")).toBe(true);
  });

  test("should not detect OpenAI models", () => {
    expect(isDeepSeekModel("gpt-4o")).toBe(false);
    expect(isDeepSeekModel("o3-mini")).toBe(false);
    expect(isDeepSeekModel(undefined)).toBe(false);
  });
});
