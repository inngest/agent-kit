/**
 * Adapters for OpenAI I/O to transform to/from internal network messages.
 *
 * @module
 */

import { type AiAdapter, type OpenAi } from "@inngest/ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { type AgenticModel } from "../model";
import {
  type Message,
  type TextMessage,
  type ToolCallMessage,
  type ToolMessage,
} from "../types";
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
    messages: messages.map((m: Message) => {
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
    // OpenAI o3 models have several issues with tool calling.
    //  one of them is not supporting the `parallel_tool_calls` parameter
    //  https://community.openai.com/t/o3-mini-api-with-tools-only-ever-returns-1-tool-no-matter-prompt/1112390/6
    if (
      !model.options.model?.includes("o3") &&
      !model.options.model?.includes("o1")
    ) {
      // it is recommended to disable parallel tool calls with structured output
      // https://platform.openai.com/docs/guides/function-calling#parallel-function-calling-and-structured-outputs
      request.parallel_tool_calls = false;
    }

    request.tools = tools.map((t: Tool.Any) => {
      return {
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters:
            t.parameters && zodToJsonSchema(t.parameters, { target: "openAi" }),
          strict:
            typeof t.strict !== "undefined" ? t.strict : Boolean(t.parameters), // strict mode is only supported with parameters
        },
      };
    });
  }

  return request;
};

/**
 * Parse a response from OpenAI output to internal network messages.
 *
 * This function transforms OpenAI's response format into our internal Message format,
 * handling both text responses and tool calls. It processes multiple choices if present
 * and creates separate messages for text content and tool calls when both exist.
 */
export const responseParser: AgenticModel.ResponseParser<OpenAi.AiModel> = (
  input
) => {
  // Handle API errors first - throw immediately if the request failed
  if (input.error) {
    throw new Error(
      input.error.message ||
        `OpenAI request failed: ${JSON.stringify(input.error)}`
    );
  }

  // Process all choices from the OpenAI response using reduce to flatten into a single Message array
  // OpenAI can return multiple choices, though typically only one is returned
  return (input?.choices ?? []).reduce<Message[]>((acc, choice) => {
    const { message, finish_reason } = choice;

    // Skip empty messages - can happen in some edge cases
    if (!message) {
      return acc;
    }

    // Create base message properties shared by all message types
    // Maps OpenAI's finish_reason to our internal stop_reason format
    const base = {
      role: choice.message.role,
      stop_reason:
        openAiStopReasonToStateStopReason[finish_reason ?? ""] || "stop",
    };

    // Handle text content - only create a text message if content exists and isn't empty/whitespace
    // This check prevents empty content messages that can occur when only tool calls are present
    if (message.content && message.content.trim() !== "") {
      acc.push({
        ...base,
        type: "text",
        content: message.content,
      } as TextMessage);
    }

    // Handle tool calls - create a separate tool_call message containing all tools
    // OpenAI can return multiple tool calls in a single response (parallel tool calling)
    if ((message.tool_calls?.length ?? 0) > 0) {
      acc.push({
        ...base,
        type: "tool_call",
        tools: message.tool_calls.map((tool) => {
          return {
            type: "tool",
            id: tool.id,
            name: tool.function.name,
            function: tool.function.name, // Duplicate for backward compatibility
            // Use safe parser to handle OpenAI's JSON quirks (like backticks in strings)
            input: safeParseOpenAIJson(tool.function.arguments || "{}"),
          } as ToolMessage;
        }),
      } as ToolCallMessage);
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
