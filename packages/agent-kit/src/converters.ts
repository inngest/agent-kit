/**
 * Converters between internal Message/Tool types and the Vercel AI SDK types.
 *
 * @module
 */
import { jsonSchema, type CoreMessage, type CoreTool } from "ai";
import { z } from "zod";
import {
  type Message,
  type TextMessage,
  type ToolCallMessage,
  type ToolMessage,
} from "./types";
import { type Tool } from "./tool";

/**
 * Convert internal Message[] to AI SDK CoreMessage[].
 */
export function messagesToCoreMessages(messages: Message[]): CoreMessage[] {
  const result: CoreMessage[] = [];

  for (const msg of messages) {
    switch (msg.type) {
      case "text": {
        if (msg.role === "system") {
          const content = typeof msg.content === "string"
            ? msg.content
            : msg.content.map((c) => c.text).join("");
          result.push({ role: "system", content });
        } else if (msg.role === "user") {
          const content = typeof msg.content === "string"
            ? msg.content
            : msg.content.map((c) => c.text).join("");
          result.push({ role: "user", content });
        } else if (msg.role === "assistant") {
          const content = typeof msg.content === "string"
            ? msg.content
            : msg.content.map((c) => c.text).join("");
          result.push({ role: "assistant", content });
        }
        break;
      }
      case "tool_call": {
        // Convert to assistant message with tool-call parts
        result.push({
          role: "assistant",
          content: msg.tools.map((tool) => ({
            type: "tool-call" as const,
            toolCallId: tool.id,
            toolName: tool.name,
            args: tool.input,
          })),
        });
        break;
      }
      case "tool_result": {
        // Convert to tool message with tool-result part
        result.push({
          role: "tool",
          content: [
            {
              type: "tool-result" as const,
              toolCallId: msg.tool.id,
              toolName: msg.tool.name,
              result: msg.content,
            },
          ],
        });
        break;
      }
    }
  }

  return result;
}

/**
 * Serializable subset of generateText result for step.run() compatibility.
 */
export interface SerializableResult {
  text: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  finishReason: string;
}

/**
 * Convert AI SDK generateText result to internal Message[].
 */
export function resultToMessages(result: SerializableResult): Message[] {
  const messages: Message[] = [];

  // Add text message if present
  if (result.text && result.text.trim() !== "") {
    const hasToolCalls = result.toolCalls && result.toolCalls.length > 0;
    messages.push({
      type: "text",
      role: "assistant",
      content: result.text,
      stop_reason: hasToolCalls ? "tool" : "stop",
    } as TextMessage);
  }

  // Add tool call message if present
  if (result.toolCalls && result.toolCalls.length > 0) {
    messages.push({
      type: "tool_call",
      role: "assistant",
      stop_reason: "tool",
      tools: result.toolCalls.map(
        (tc): ToolMessage => ({
          type: "tool",
          id: tc.toolCallId,
          name: tc.toolName,
          input: tc.args as Record<string, unknown>,
        })
      ),
    } as ToolCallMessage);
  }

  // If no text and no tool calls, add empty text message
  if (messages.length === 0) {
    messages.push({
      type: "text",
      role: "assistant",
      content: "",
      stop_reason: "stop",
    } as TextMessage);
  }

  return messages;
}

/**
 * Convert internal Tool.Any[] to AI SDK tool definitions.
 *
 * Note: We do NOT pass `execute` here — tool execution is handled by the
 * agent's own invokeTools method after inference.
 */
export function toolsToAiTools(
  tools: Tool.Any[]
): Record<string, CoreTool> {
  const result: Record<string, CoreTool> = {};

  for (const tool of tools) {
    result[tool.name] = {
      description: tool.description,
      parameters: tool.parameters
        ? jsonSchema(z.toJSONSchema(tool.parameters, { target: "draft-7" }) as Parameters<typeof jsonSchema>[0])
        : jsonSchema({ type: "object", properties: {} }),
    };
  }

  return result;
}

/**
 * Map internal Tool.Choice to AI SDK toolChoice format.
 */
export function mapToolChoice(
  choice: Tool.Choice
): "auto" | "required" | "none" | { type: "tool"; toolName: string } {
  switch (choice) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    default:
      return { type: "tool", toolName: choice };
  }
}
