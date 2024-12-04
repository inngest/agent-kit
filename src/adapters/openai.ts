/**
 * Adapters for OpenAI I/O to transform to/from internal network messages.
 *
 * @module
 */

import { type AiAdapter, type OpenAi } from "inngest";
import { zodToJsonSchema } from "openai-zod-to-json-schema";
import { type AgenticModel } from "../model";
import { type InternalNetworkMessage, type ToolMessage } from "../state";

// Helper to parse JSON that may contain backticks:
// Example:
// "{\n  \"files\": [\n    {\n      \"filename\": \"fibo.ts\",\n      \"content\": `\nfunction fibonacci(n: number): number {\n  if (n < 2) {\n    return n;\n  } else {\n    return fibonacci(n - 1) + fibonacci(n - 2);\n  }\n}\n\nexport default fibonacci;\n`\n    }\n  ]\n}"
const safeParseOpenAIJson = (str: string): unknown => {
  // Remove any leading/trailing quotes if present
  const trimmed = str.replace(/^["']|["']$/g, '');
  
  try {
    // First try direct JSON parse
    return JSON.parse(trimmed);
  } catch {
    try {
      // Replace backtick strings with regular JSON strings
      // Match content between backticks, preserving newlines
      const withQuotes = trimmed.replace(
        /`([\s\S]*?)`/g, 
        (_, content) => JSON.stringify(content)
      );
      return JSON.parse(withQuotes);
    } catch (e) {
      throw new Error(`Failed to parse JSON with backticks: ${e}`);
    }
  }
};



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
      return {
        role: m.role,
        content: m.content,
      };
    }) as AiAdapter.Input<OpenAi.AiModel>["messages"],
  };

  if (tools?.length) {
    request.tool_choice = "auto";
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

      return [
        ...acc,
        {
          role: choice.message.role,
          content: choice.message.content,
          tools: (choice.message.tool_calls ?? []).map<ToolMessage>((tool) => {
            return {
              type: "tool",
              id: tool.id,
              name: tool.function.name,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              input: JSON.parse(tool.function.arguments || "{}"),
            };
          }),
        } as InternalNetworkMessage,
      ];
    },
    [],
  );
};
