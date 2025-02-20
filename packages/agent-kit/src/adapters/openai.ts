/**
 * Adapters for OpenAI I/O to transform to/from internal network messages.
 *
 * @module
 */

import { type AiAdapter, type OpenAi } from "@inngest/ai";
import { zodToJsonSchema } from "openai-zod-to-json-schema";
import { type AgenticModel } from "../model";
import {
  type Message,
  type TextMessage,
  type ToolCallMessage,
  type ToolMessage,
} from "../state";
import { type Tool } from "../tool";
import { stringifyError } from "../util";

/**
 * Parse a request from internal network messages to an OpenAI input.
 */
export const requestParser: AgenticModel.RequestParser<OpenAi.AiModel> = (
  model,
  messages,
  tools,
  tool_choice = "auto"
) => {
  const request: AiAdapter.Input<OpenAi.AiModel> = {
    messages: messages.map((m) => {
      switch (m.type) {
        case "text":
          return {
            role: m.role,
            content: m.content,
          };
        case "tool_call":
          return {
            role: "assistant",
            content: null,
            tool_calls: m.tools
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
        case "tool_result":
          return {
            role: "tool",
            tool_call_id: m.tool.id,
            content:
              typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content),
          };
      }
    }) as AiAdapter.Input<OpenAi.AiModel>["messages"],
  };

  if (tools?.length) {
    request.tool_choice = toolChoice(tool_choice);
    // it is recommended to disable parallel tool calls with structured output
    // https://platform.openai.com/docs/guides/function-calling#parallel-function-calling-and-structured-outputs
    request.parallel_tool_calls = false;
    request.tools = tools.map((t) => {
      return {
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters && zodToJsonSchema(t.parameters),
          strict: Boolean(t.parameters), // strict mode is only supported with parameters
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
  input
) => {

  if (input.error) {
    throw new Error(input.error.message || `OpenAI request failed: ${input.error});
  }

  return (input?.choices ?? []).reduce<Message[]>((acc, choice) => {
    const { message, finish_reason } = choice;
    if (!message) {
      return acc;
    }

    const base = {
      role: choice.message.role,
      stop_reason:
        openAiStopReasonToStateStopReason[finish_reason ?? ""] || "stop",
    };

    if (message.content) {
      return [
        ...acc,
        {
          ...base,
          type: "text",
          content: message.content,
        } as TextMessage,
      ];
    }
    if (message.tool_calls.length > 0) {
      return [
        ...acc,
        {
          ...base,
          type: "tool_call",
          tools: message.tool_calls.map((tool) => {
            return {
              type: "tool",
              id: tool.id,
              name: tool.function.name,
              function: tool.function.name,
              input: safeParseOpenAIJson(tool.function.arguments || "{}"),
            } as ToolMessage;
          }),
        } as ToolCallMessage,
      ];
    }
    return acc;
  }, []);
};

/**
 * Parse the given `str` `string` as JSON, also handling backticks, a common
 * OpenAI quirk.
 *
 * @example Input
 * ```
 * "{\n  \"files\": [\n    {\n      \"filename\": \"fibo.ts\",\n      \"content\": `\nfunction fibonacci(n: number): number {\n  if (n < 2) {\n    return n;\n  } else {\n    return fibonacci(n - 1) + fibonacci(n - 2);\n  }\n}\n\nexport default fibonacci;\n`\n    }\n  ]\n}"
 * ```
 */
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
        JSON.stringify(content)
      );
      return JSON.parse(withQuotes);
    } catch (e) {
      throw new Error(
        `Failed to parse JSON with backticks: ${stringifyError(e)}`
      );
    }
  }
};

const openAiStopReasonToStateStopReason: Record<string, string> = {
  tool_calls: "tool",
  stop: "stop",
  length: "stop",
  content_filter: "stop",
  function_call: "tool",
};

const toolChoice = (choice: Tool.Choice) => {
  switch (choice) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    default:
      return {
        type: "function" as const,
        function: { name: choice as string },
      };
  }
};
