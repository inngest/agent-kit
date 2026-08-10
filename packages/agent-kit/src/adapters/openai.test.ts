import { describe, expect, test } from "vitest";
import { responseParser, requestParser, isReasoningModel } from "./openai";
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

  test("should parse backtick-delimited tool arguments containing template literals", () => {
    const source = [
      "export const Greeting = ({ name }: { name: string }) => {",
      "  const greeting = `Hello, ${name}`;",
      "  return <div>{`Message: ${greeting}`}</div>;",
      "};",
    ].join("\n");
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_write",
                type: "function",
                function: {
                  name: "write",
                  arguments: `{"files":[{"path":"app.tsx","content":\`${source}\`}]}`,
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result[0]).toMatchObject({
      type: "tool_call",
      tools: [
        {
          input: {
            files: [{ path: "app.tsx", content: source }],
          },
        },
      ],
    });
  });

  test("should parse multiple backtick-delimited tool arguments", () => {
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_write",
                type: "function",
                function: {
                  name: "write",
                  arguments:
                    '{"files":[{"path":"a.ts","content":`export const a = 1;`},{"path":"b.ts","content":`export const b = `two`;`}]}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result[0]).toMatchObject({
      type: "tool_call",
      tools: [
        {
          input: {
            files: [
              { path: "a.ts", content: "export const a = 1;" },
              { path: "b.ts", content: "export const b = `two`;" },
            ],
          },
        },
      ],
    });
  });

  test("should preserve raw control characters inside JSON strings", () => {
    const content = "first line\n\tindented\u0000value\u001fend\r\n";
    const argumentsText = `{"files":[{"path":"app.tsx","content":"${content}"}]}`;
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_write",
                type: "function",
                function: {
                  name: "write",
                  arguments: argumentsText,
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result[0]).toMatchObject({
      type: "tool_call",
      tools: [
        {
          input: {
            files: [{ path: "app.tsx", content }],
          },
        },
      ],
    });
  });

  test("should not change valid JSON strings containing escaped controls", () => {
    const argumentsText =
      '{"files":[{"path":"app.tsx","content":"line one\\n\\tline two\\u0000"}]}';
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_write",
                type: "function",
                function: { name: "write", arguments: argumentsText },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result[0]).toMatchObject({
      type: "tool_call",
      tools: [
        {
          input: {
            files: [{ path: "app.tsx", content: "line one\n\tline two\u0000" }],
          },
        },
      ],
    });
  });

  test("should preserve invalid JSON escapes as literal string content", () => {
    const content = [
      "const surname = 'Liam O\\'Brien';",
      "const digits = /\\d+/g;",
      "const hex = '\\x41';",
    ].join("\n");
    const argumentsText = `{"files":[{"path":"app.ts","content":"${content}"}]}`;
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_write",
                type: "function",
                function: { name: "write", arguments: argumentsText },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };

    const result = responseParser(input as never);
    expect(result[0]).toMatchObject({
      type: "tool_call",
      tools: [
        {
          input: {
            files: [{ path: "app.ts", content }],
          },
        },
      ],
    });
  });

  test("should reject ambiguous malformed JSON with sanitized diagnostics", () => {
    const argumentsText = '{"command":"node -e "console.log(\\"unsafe\\")""}';
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_bash",
                type: "function",
                function: { name: "bash", arguments: argumentsText },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };

    expect(() => responseParser(input as never)).toThrow(
      `Failed to parse tool arguments for bash (finish_reason: tool_calls, arguments_length: ${argumentsText.length})`
    );
    expect(() => responseParser(input as never)).toThrow(
      "Invalid JSON separator"
    );

    try {
      responseParser(input as never);
    } catch (error) {
      expect(String(error)).not.toContain("console.log");
    }
  });

  test("should reject an escaped raw control character as ambiguous", () => {
    const argumentsText = '{"command":"echo \\\nnext"}';
    const input = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_bash",
                type: "function",
                function: { name: "bash", arguments: argumentsText },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };

    expect(() => responseParser(input as never)).toThrow(
      "Failed to parse tool arguments for bash"
    );
  });
});

describe("openai requestParser", () => {
  const mockModel = {
    options: { model: "gpt-4" },
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
    }>;

    expect(outMessages).toHaveLength(3);
    expect(outMessages[0]!.role).toBe("system");
    expect(outMessages[1]!.role).toBe("user");
    expect(outMessages[2]!.role).toBe("assistant");
    expect(outMessages[2]!.content).toBe("4");
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
