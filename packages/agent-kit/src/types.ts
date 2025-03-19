export type Message = TextMessage | ToolCallMessage | ToolResultMessage;

/**
 * TextMessage represents plain text messages in the chat history, eg. the user's prompt or
 * an assistant's reply.
 */
export interface TextMessage {
  type: "text";
  role: "system" | "user" | "assistant";
  content: string | Array<TextContent>;
  // Anthropic:
  // stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  // OpenAI:
  // finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;
  stop_reason?: "tool" | "stop";
}

/**
 * ToolCallMessage represents a message for a tool call.
 */
export interface ToolCallMessage {
  type: "tool_call";
  role: "user" | "assistant";
  tools: ToolMessage[];
  stop_reason: "tool";
}

/**
 * ToolResultMessage represents the output of a tool call.
 */
export interface ToolResultMessage {
  type: "tool_result";
  role: "tool_result";
  // tool contains the tool call request for this result.
  tool: ToolMessage;
  content: unknown;
  stop_reason: "tool";
}

// Message content.

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolMessage {
  type: "tool";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
