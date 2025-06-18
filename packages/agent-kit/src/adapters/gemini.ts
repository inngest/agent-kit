/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Adapters for Gemini I/O to transform to/from internal network messages.
 *
 * @module
 */
import { type AiAdapter, type Gemini } from "@inngest/ai";
import { z, type ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { type AgenticModel } from "../model";
import type { Message, TextContent } from "../types";
import { type Tool } from "../tool";

/**
 * Parse a request from internal network messages to an Gemini input.
 */
export const requestParser: AgenticModel.RequestParser<Gemini.AiModel> = (
  _model,
  messages,
  tools,
  tool_choice = "auto"
) => {
  const contents = messages.map((m: Message) => messageToContent(m));

  const functionDeclarations = tools.map((t: Tool.Any) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
      ? geminiZodToJsonSchema(t.parameters)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (geminiZodToJsonSchema(z.object({})) as any),
  }));

  return {
    contents,
    ...(tools.length > 0
      ? {
          tools: [
            {
              functionDeclarations,
            },
          ],
          tool_config: toolChoice(tool_choice),
        }
      : {}),
  };
};

const messageContentToString = (content: string | TextContent[]): string => {
  if (typeof content === "string") {
    return content;
  }
  return content.map((c) => c.text).join("");
};

/**
 * Parse a response from Gemini output to internal network messages.
 */
export const responseParser: AgenticModel.ResponseParser<Gemini.AiModel> = (
  input
) => {
  if (input.error) {
    throw new Error(
      input.error?.message ||
        `Gemini request failed: ${JSON.stringify(input.error)}`
    );
  }

  const messages: Message[] = [];

  for (const candidate of input.candidates ?? []) {
    if ((candidate.finishReason as string) === "MALFORMED_FUNCTION_CALL") {
      console.warn(
        "Gemini returned MALFORMED_FUNCTION_CALL, skipping this candidate. This typically indicates an issue with tool/function call formatting. Check your tool definitions and parameters."
      );
      continue; // Skip this candidate but continue processing others
    }
    if (!candidate.content?.parts) {
      continue; // Skip candidates without parts
    }
    for (const content of candidate.content.parts) {
      // user text
      if (candidate.content.role === "user" && "text" in content) {
        messages.push({
          role: "user",
          type: "text",
          content: content.text,
        });
      }
      // assistant text
      else if (candidate.content.role === "model" && "text" in content) {
        messages.push({
          role: "assistant",
          type: "text",
          content: content.text,
        });
      }
      // tool call
      else if (
        candidate.content.role === "model" &&
        "functionCall" in content
      ) {
        messages.push({
          role: "assistant",
          type: "tool_call",
          stop_reason: "tool",
          tools: [
            {
              name: content.functionCall.name,
              input: content.functionCall.args,
              type: "tool",
              id: content.functionCall.name,
            },
          ],
        });
      }
      // tool result
      else if (
        candidate.content.role === "user" &&
        "functionResponse" in content
      ) {
        messages.push({
          role: "tool_result",
          type: "tool_result",
          stop_reason: "tool",
          tool: {
            name: content.functionResponse.name,
            input: content.functionResponse.response,
            type: "tool",
            id: content.functionResponse.name,
          },
          content: JSON.stringify(content.functionResponse.response),
        });
      } else {
        throw new Error("Unknown content type");
      }
    }
  }

  return messages;
};

const messageToContent = (
  m: Message
): AiAdapter.Input<Gemini.AiModel>["contents"][0] => {
  switch (m.role) {
    case "system":
      return {
        role: "user",
        parts: [{ text: messageContentToString(m.content) }],
      };
    case "user":
      switch (m.type) {
        case "tool_call":
          if (m.tools.length === 0) {
            throw new Error("Tool call message must have at least one tool");
          }
          // Note: multiple tools is only supported over WS (Compositional function calling)
          return {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: m.tools[0]!.name,
                  args: m.tools[0]!.input,
                },
              },
            ],
          };
        case "text":
        default:
          return {
            role: "user",
            parts: [{ text: messageContentToString(m.content) }],
          };
      }
    case "assistant":
      switch (m.type) {
        case "tool_call":
          if (m.tools.length === 0) {
            throw new Error("Tool call message must have at least one tool");
          }
          // Note: multiple tools is only supported over WS (Compositional function calling)
          return {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: m.tools[0]!.name,
                  args: m.tools[0]!.input,
                },
              },
            ],
          };
        case "text":
        default:
          return {
            role: "model",
            parts: [{ text: messageContentToString(m.content) }],
          };
      }
    case "tool_result":
      return {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.tool.name,
              response: {
                name: m.tool.name,
                content:
                  typeof m.content === "string"
                    ? m.content
                    : JSON.stringify(m.content),
              },
            },
          },
        ],
      };
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(`Unknown message role: ${(m as any).role}`);
  }
};

const toolChoice = (
  choice: Tool.Choice
): AiAdapter.Input<Gemini.AiModel>["toolConfig"] => {
  switch (choice) {
    case "auto":
      return {
        functionCallingConfig: {
          mode: "AUTO",
        },
      };
    case "any":
      return {
        functionCallingConfig: {
          mode: "ANY",
        },
      };
    default:
      if (typeof choice === "string") {
        return {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: [choice],
          },
        };
      }
  }
};

const geminiZodToJsonSchema = (zod: ZodSchema) => {
  const schema = zodToJsonSchema(zod, { target: "openApi3" });
  // @ts-expect-error this prop does exists and Gemini don't like it
  delete schema["additionalProperties"];
  return schema;
};
