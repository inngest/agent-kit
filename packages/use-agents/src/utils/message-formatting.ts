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

import { type ConversationMessage, type TextUIPart, type ToolCallUIPart } from '../types/index.js';

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
export type AgentKitMessage = 
  | { role: 'user' | 'assistant'; type: 'text'; content: string; stop_reason?: 'tool' | 'stop' }
  | { role: 'user' | 'assistant'; type: 'tool_call'; tools: Array<{ type: 'tool'; id: string; name: string; input: Record<string, unknown> }>; stop_reason: 'tool' }
  | { role: 'tool_result'; type: 'tool_result'; tool: { type: 'tool'; id: string; name: string; input: Record<string, unknown> }; content: unknown; stop_reason: 'tool' };

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
export const formatMessagesToAgentKitHistory = (messages: ConversationMessage[]): AgentKitMessage[] => {
  const result: AgentKitMessage[] = [];
  
  for (const msg of messages) {
    if (msg.role === 'user') {
      // For user messages, extract text content
      const textPart = msg.parts.find(p => p.type === 'text') as TextUIPart;
      const content = textPart?.content || '';
      if (content.trim()) {
        result.push({
          type: 'text',
          role: 'user',
          content,
        });
      }
    } else if (msg.role === 'assistant') {
      // For assistant messages, extract text parts first
      const textParts = msg.parts.filter(p => p.type === 'text') as TextUIPart[];
      if (textParts.length > 0) {
        const textContent = textParts.map(p => p.content).join('\n');
        if (textContent.trim()) {
          result.push({
            type: 'text',
            role: 'assistant',
            content: textContent,
          });
        }
      }
      
      // Then extract tool call parts
      const toolCallParts = msg.parts.filter(p => p.type === 'tool-call') as ToolCallUIPart[];
      if (toolCallParts.length > 0) {
        // Group tool calls that are completed (have both input and output)
        const completedToolCalls = toolCallParts.filter(p => 
          p.state === 'output-available' && p.input && p.output !== undefined
        );
        
        if (completedToolCalls.length > 0) {
          // Create ToolCallMessage for the tool calls
          result.push({
            type: 'tool_call',
            role: 'assistant',
            stop_reason: 'tool',
            tools: completedToolCalls.map(toolPart => ({
              type: 'tool',
              id: toolPart.toolCallId,
              name: toolPart.toolName,
              input: typeof toolPart.input === 'object' && toolPart.input !== null 
                ? toolPart.input as Record<string, unknown>
                : { args: toolPart.input },
            })),
          });
          
          // Create ToolResultMessage for each tool's output
          completedToolCalls.forEach(toolPart => {
            result.push({
              type: 'tool_result',
              role: 'tool_result',
              stop_reason: 'tool',
              tool: {
                type: 'tool',
                id: toolPart.toolCallId,
                name: toolPart.toolName,
                input: typeof toolPart.input === 'object' && toolPart.input !== null 
                  ? toolPart.input as Record<string, unknown>
                  : { args: toolPart.input },
              },
              content: toolPart.output,
            });
          });
        }
      }
    }
  }
  
  return result;
};
