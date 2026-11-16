/**
 * Utility functions for formatting messages between UI and AgentKit formats.
 *
 * This module provides critical message transformation logic that enables
 * AgentKit React hooks to communicate with AgentKit networks. It handles the
 * conversion between the rich UI message format (with streaming parts) and
 * AgentKit's structured message format (with tool calls and results).
 *
 * @fileoverview Message format conversion utilities for AgentKit React integration
 */

import {
  type ConversationMessage,
  type TextUIPart,
  type ToolManifest,
  type AgentKitMessage,
} from "../types/index.js";

/**
 * AgentKit Message format union type.
 *
 * This mirrors the Message union type from AgentKit core, ensuring compatibility
 * with AgentKit networks. The hooks use this format when sending conversation
 * history to agents for context.
 *
 * @example
 * ```typescript
 * const agentMessages: AgentKitMessage[] = [
 *   { role: 'user', type: 'text', content: 'Hello' },
 *   { role: 'assistant', type: 'text', content: 'Hi there!' },
 *   { role: 'assistant', type: 'tool_call', tools: [...], stop_reason: 'tool' },
 *   { role: 'tool_result', type: 'tool_result', tool: {...}, content: 'Result' }
 * ];
 * ```
 */
// AgentKitMessage now lives in ../types; import and reuse to avoid duplication

/**
 * A pure function that transforms the UI's rich `ConversationMessage` array
 * into the AgentKit Message format expected by the backend.
 * This is crucial for maintaining context between conversation turns.
 *
 * The function extracts text content, tool calls, and tool results from each message,
 * converting them to the proper AgentKit Message format (TextMessage, ToolCallMessage, ToolResultMessage).
 *
 * @param messages - The array of `ConversationMessage` from the UI state
 * @returns An array of AgentKit Message objects (TextMessage, ToolCallMessage, ToolResultMessage)
 * @example
 * ```typescript
 * const uiMessages = [
 *   { role: 'user', parts: [{ type: 'text', content: 'Hello' }] },
 *   { role: 'assistant', parts: [{ type: 'text', content: 'Hi!' }, { type: 'tool-call', ... }] }
 * ];
 * const history = formatMessagesToAgentKitHistory(uiMessages);
 * // Returns: [{ role: 'user', type: 'text', content: 'Hello' }, { role: 'assistant', type: 'text', content: 'Hi!' }, { role: 'assistant', type: 'tool_call', tools: [...] }]
 * ```
 */
export const formatMessagesToAgentKitHistory = <
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
>(
  messages: ConversationMessage<TManifest, TState>[]
): AgentKitMessage[] => {
  const result: AgentKitMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      // For user messages, extract text content
      const textPart = msg.parts.find((p) => p.type === "text") as TextUIPart;
      const content = textPart?.content || "";
      if (content.trim()) {
        result.push({
          type: "text",
          role: "user",
          content,
        });
      }
    } else if (msg.role === "assistant") {
      for (let index = 0; index < msg.parts.length; ) {
        const part = msg.parts[index];
        if (part.type === "text") {
          const text: string[] = [];
          while (msg.parts[index]?.type === "text") {
            text.push((msg.parts[index] as TextUIPart).content);
            index++;
          }
          const content = text.join("\n");
          if (content.trim())
            result.push({ type: "text", role: "assistant", content });
          continue;
        }
        if (part.type !== "tool-call") {
          index++;
          continue;
        }

        const toolParts = [];
        while (msg.parts[index]?.type === "tool-call") {
          const toolPart = msg.parts[index++];
          if (
            toolPart.type === "tool-call" &&
            toolPart.state === "output-available" &&
            toolPart.input &&
            toolPart.output !== undefined
          )
            toolParts.push(toolPart);
        }
        if (toolParts.length === 0) continue;
        const tools = toolParts.map((toolPart) => ({
          type: "tool" as const,
          id: toolPart.toolCallId,
          name: toolPart.toolName,
          input:
            typeof toolPart.input === "object" && toolPart.input !== null
              ? (toolPart.input as Record<string, unknown>)
              : { args: toolPart.input },
        }));
        result.push({
          type: "tool_call",
          role: "assistant",
          stop_reason: "tool",
          tools,
        });
        toolParts.forEach((toolPart, toolIndex) => {
          result.push({
            type: "tool_result",
            role: "tool_result",
            stop_reason: "tool",
            tool: tools[toolIndex],
            content:
              "rawOutput" in toolPart ? toolPart.rawOutput : toolPart.output,
          });
        });
      }
    }
  }

  return result;
};
