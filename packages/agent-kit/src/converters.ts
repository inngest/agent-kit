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
        const content = typeof msg.content === "string"
          ? msg.content
          : msg.content.map((c) => c.text).join("");
        result.push({ role: msg.role, content });
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

  const hasToolCalls = result.toolCalls && result.toolCalls.length > 0;

  // Add text message if present
  if (result.text && result.text.trim() !== "") {
    const msg: TextMessage = {
      type: "text",
      role: "assistant",
      content: result.text,
      stop_reason: hasToolCalls ? "tool" : "stop",
    };
    messages.push(msg);
  }

  // Add tool call message if present
  if (hasToolCalls) {
    const msg: ToolCallMessage = {
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
    };
    messages.push(msg);
  }

  // If no text and no tool calls, add empty text message
  if (messages.length === 0) {
    const msg: TextMessage = {
      type: "text",
      role: "assistant",
      content: "",
      stop_reason: "stop",
    };
    messages.push(msg);
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
    let parameters: CoreTool["parameters"];
    if (tool.parameters) {
      try {
        parameters = jsonSchema(
          z.toJSONSchema(tool.parameters, { target: "draft-7" }) as Parameters<typeof jsonSchema>[0]
        );
      } catch {
        // Fallback for schemas that z.toJSONSchema() cannot handle (e.g. Zod v3
        // schemas from MCP's JSON-Schema-to-Zod converter). Use an open object
        // schema so the tool is still callable.
        parameters = jsonSchema({ type: "object", properties: {} });
      }
    } else {
      parameters = jsonSchema({ type: "object", properties: {} });
    }

    result[tool.name] = {
      description: tool.description,
      parameters,
    };
  }

  return result;
}

/**
 * Map internal Tool.Choice to AI SDK toolChoice format.
 */
export function mapToolChoice(
  choice: Tool.Choice
): "auto" | "required" | { type: "tool"; toolName: string } {
  switch (choice) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    default:
      return { type: "tool", toolName: choice };
  }
}
