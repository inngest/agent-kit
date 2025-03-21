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

/**
 * AgentResult represents a single iteration of an agent call in the router
 * loop.  This includes the input prompt, the resulting messages, and any
 * tool call results.
 *
 * This is used in several ways:
 *
 *   1. To track the results of a given agent, including output and tool results.
 *   2. To construct chat history for each agent call in a network loop.
 *   3. To track what was sent to a given agent at any time.
 *
 *
 * ## Chat history and agent inputs in Networks.
 *
 * Networks call agents in a loop.  Each iteration of the loop adds to conversation
 * history.
 *
 * We construct the agent input by:
 *
 *   1. Taking the system prompt from an agent
 *   2. Adding the user request as a message
 *   3. If provided, adding the agent's assistant message.
 *
 * These two or three messages are ALWAYS the start of an agent's request:
 * [system, input, ?assistant].
 *
 * We then iterate through the state's AgentResult objects, adding the output
 * and tool calls from each result to chat history.
 *
 */
export class AgentResult {
  constructor(
    // agentName represents the name of the agent which created this result.
    public agentName: string,

    // output represents the parsed output from the inference call.  This may be blank
    // if the agent responds with tool calls only.
    public output: Message[],

    // toolCalls represents output from any tools called by the agent.
    public toolCalls: ToolResultMessage[],

    // createdAt represents when this message was created.
    public createdAt: Date,

    // prompt represents the input instructions - without any additional history
    // - as created by the agent.  This includes the system prompt, the user input,
    // and any initial agent assistant message.
    //
    // This is ONLY used for tracking and debugging purposes, and is entirely optional.
    // It is not used to construct messages for future calls, and only serves to see
    // what was sent to the agent in this specific request.
    public prompt?: Message[],

    // history represents the history sent to the inference call, appended to the
    // prompt to form a complete conversation log.
    //
    // This is ONLY used for tracking and debugging purposes, and is entirely optional.
    // It is not used to construct messages for future calls, and only serves to see
    // what was sent to the agent in this specific request.
    public history?: Message[],

    // raw represents the raw API response from the call.  This is a JSON
    // string, and the format depends on the agent's model.
    public raw?: string
  ) {}
}
