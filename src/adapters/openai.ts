/**
 * Adapters for OpenAI I/O to transform to/from internal network messages.
 *
 * @module
 */

import { type AiAdapter, type OpenAi } from "inngest";
import { zodToJsonSchema } from "openai-zod-to-json-schema";
import { type AgenticModel } from "../model";
import { stringifyError } from "../util";
import { type InternalNetworkMessage, type ToolMessage } from "../state";

// Helper to parse JSON that may contain backticks:
// Example:
// "{\n  \"files\": [\n    {\n      \"filename\": \"fibo.ts\",\n      \"content\": `\nfunction fibonacci(n: number): number {\n  if (n < 2) {\n    return n;\n  } else {\n    return fibonacci(n - 1) + fibonacci(n - 2);\n  }\n}\n\nexport default fibonacci;\n`\n    }\n  ]\n}"
const safeParseOpenAIJson = (str: string): unknown => {
  // Remove any leading/trailing quotes if present
  const trimmed = str.replace(/^["']|["']$/g, "");

  try {
    // First try direct JSON parse
    return JSON.parse(trimmed);
  } catch {
    try {
      // Replace backtick strings with regular JSON strings
      // Match content between backticks, preserving newlines
      const withQuotes = trimmed.replace(/`([\s\S]*?)`/g, (_, content) =>
        JSON.stringify(content),
      );
      return JSON.parse(withQuotes);
    } catch (e) {
      throw new Error(
        `Failed to parse JSON with backticks: ${stringifyError(e)}`,
      );
    }
  }
};

// TODO: move to another file?
const StateRoleToOpenAiRole = {
  system: "system",
  user: "user",
  assistant: "assistant",
  tool_result: "tool",
} as const;

const StateStopReasonToOpenAiStopReason = {
  tool: "tool_calls",
  stop: "stop",
} as const;

const OpenAiStopReasonToStateStopReason = {
  tool_calls: "tool",
  stop: "stop",
  length: "stop",
  content_filter: "stop",
  function_call: "tool",
} as const;

/**
 * Parse a request from internal network messages to an OpenAI input.
 */
export const requestParser: AgenticModel.RequestParser<OpenAi.AiModel> = (
  model,
  messages,
  tools,
) => {
  const request: AiAdapter.Input<OpenAi.AiModel> = {
    messages: messages.map((m) => {
      const role = StateRoleToOpenAiRole[m.role];
      return {
        ...(m.stop_reason
          ? { finish_reason: StateStopReasonToOpenAiStopReason[m.stop_reason] }
          : {}),
        role,
        content: m.content,
        // NOTE: this is very ugly, we need to better handle different shape of messages
        // TODO: refactor + unit tests
        tool_call_id: role === "tool" ? m.tools?.[0]?.id : undefined,
        tool_calls:
          role === "assistant" && !!m.tools
            ? m.tools?.map((tool) => ({
                id: tool.id,
                type: "function",
                function: {
                  name: tool.name,
                  arguments: JSON.stringify(tool.input),
                },
              }))
            : undefined,
      };
    }) as AiAdapter.Input<OpenAi.AiModel>["messages"],
  };

  if (tools?.length) {
    request.tool_choice = "auto";
    // it is recommended to disable parallel tool calls with structured output
    // https://platform.openai.com/docs/guides/function-calling#parallel-function-calling-and-structured-outputs
    request.parallel_tool_calls = false;
    request.tools = tools.map((t) => {
      return {
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: zodToJsonSchema(t.parameters),
          strict: true,
        },
      };
    });
  }

  return request;
};

/**
 * Parse a response from OpenAI output to internal network messages.
 */
export const responseParser: AgenticModel.ResponseParser<OpenAi.AiModel> = (
  input,
) => {
  return (input?.choices ?? []).reduce<InternalNetworkMessage[]>(
    (acc, choice) => {
      if (!choice.message) {
        return acc;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const finishReason = (choice as any).finish_reason;
      const stopReason =
        OpenAiStopReasonToStateStopReason[
          finishReason as keyof typeof OpenAiStopReasonToStateStopReason
        ];

      return [
        ...acc,
        {
          role: choice.message.role,
          content: choice.message.content,
          // NOTE: this is very ugly, we need to better handle different shape of messages
          // TODO: refactor + unit tests
          ...(finishReason
            ? {
                stop_reason: stopReason,
              }
            : {}),
          tools: (choice.message.tool_calls ?? []).map<ToolMessage>((tool) => {
            return {
              type: "function",
              id: tool.id,
              name: tool.function.name,
              function: tool.function.name,
              input: safeParseOpenAIJson(tool.function.arguments || "{}"),
            } as unknown as ToolMessage; // :(
          }),
        } as InternalNetworkMessage,
      ];
    },
    [],
  );
};
