/**
 * Centralized type definitions for AgentKit React hooks.
 *
 * This module provides a single source of truth for all types used across
 * the AgentKit React hooks ecosystem. It prevents type drift between hooks
 * and ensures consistency in message formats, streaming events, and state
 * management across the entire integration.
 *
 * ## Core Type Categories
 *
 * - **Message Types**: UI representation of conversation messages with streaming parts
 * - **Streaming State**: Multi-thread state management with event buffering
 * - **Hook Options**: Configuration interfaces for all hooks
 * - **Error Handling**: Rich error types with recovery guidance
 * - **Debug Utilities**: Logging and debugging infrastructure
 *
 * ## Package Preparation
 *
 * These types are designed to be the public API when these hooks are extracted
 * into their own npm package. They provide full TypeScript support for all
 * AgentKit React integration scenarios.
 *
 * @fileoverview Type definitions for AgentKit React hooks package
 */

import { type InngestSubscriptionState } from "@inngest/realtime/hooks";
// Note: transport types are imported where needed in framework code; no import here

// =============================================================================
// REALTIME TOKEN TYPES
// =============================================================================

/**
 * Type definition for real-time subscription tokens.
 * Based on the structure returned by @inngest/realtime getSubscriptionToken.
 */
export interface RealtimeToken {
  /** The subscription token string */
  token: string;
  /** Optional expiration timestamp */
  expires?: number;
  /** Optional channel information */
  channel?: string;
  /** Optional additional metadata */
  metadata?: Record<string, unknown>;
}

// Re-export StreamingEvent for independence from monorepo paths
// This mirrors the StreamingEvent type from AgentKit without importing directly
export interface AgentMessageChunk {
  /** The event name (e.g., "run.started", "part.created") */
  event: string;
  /** Event-specific data payload */
  data: Record<string, unknown>;
  /** When the event occurred (Unix timestamp) */
  timestamp: number;
  /** Monotonic sequence number for ordering events */
  sequenceNumber: number;
  /** Suggested Inngest step ID for optional developer use */
  id: string;
}

/**
 * Type alias for streaming events - mirrors StreamingEvent from AgentKit
 */
export type JsonObject = Record<string, unknown>;

// =============================================================================
// REALTIME EVENT UNION (KNOWN + UNKNOWN FALLBACK)
// =============================================================================

type EventBase = {
  timestamp: number;
  sequenceNumber: number;
  id: string;
};

type WithThread = { threadId?: string; userId?: string };

export type RunStarted = EventBase & {
  event: "run.started";
  data: WithThread & { name?: string };
};

export type RunCompleted = EventBase & {
  event: "run.completed";
  data: WithThread;
};

export type StreamEnded = EventBase & {
  event: "stream.ended";
  data: WithThread;
};

export type PartCreated = EventBase & {
  event: "part.created";
  data: WithThread & {
    messageId: string;
    partId: string;
    type: "text" | "tool-call";
    metadata?: { toolName?: string };
  };
};

export type TextDelta = EventBase & {
  event: "text.delta";
  data: WithThread & { messageId: string; partId: string; delta: string };
};

export type ToolArgsDelta = EventBase & {
  event: "tool_call.arguments.delta";
  data: WithThread & {
    messageId: string;
    partId: string;
    delta: string;
    toolName?: string;
    metadata?: { toolName?: string };
  };
};

export type ToolOutputDelta = EventBase & {
  event: "tool_call.output.delta";
  data: WithThread & { messageId: string; partId: string; delta: string };
};

type PartCompletedBasePayload<
  TType extends "text" | "tool-call" | "tool-output",
> = WithThread & {
  messageId: string;
  partId: string;
  type: TType;
  toolName?: string;
  metadata?: { toolName?: string };
};

type PartCompletedEventBase<
  TType extends "text" | "tool-call" | "tool-output",
  TExtra extends Record<string, unknown> = Record<string, unknown>,
> = EventBase & {
  event: "part.completed";
  data: PartCompletedBasePayload<TType> & TExtra;
};

type PartCompletedTextEvent = PartCompletedEventBase<
  "text",
  {
    finalContent?: string | undefined;
  }
>;

type PartCompletedToolCallEvent<TManifest extends ToolManifest = ToolManifest> =
  PartCompletedEventBase<
    "tool-call",
    {
      finalContent?: unknown;
      toolName?: keyof TManifest & string;
    }
  >;

type PartCompletedToolOutputFallbackEvent = PartCompletedEventBase<
  "tool-output",
  {
    finalContent?: unknown;
    toolName?: string;
  }
> & {
  data: PartCompletedEventBase<
    "tool-output",
    {
      finalContent?: unknown;
      toolName?: string;
    }
  >["data"] & {
    metadata?: { toolName?: string };
  };
};

type ManifestToolOutputEvent<TManifest extends ToolManifest> =
  keyof TManifest extends never
    ? never
    : {
        [TName in keyof TManifest & string]: PartCompletedEventBase<
          "tool-output",
          {
            toolName: TName;
            finalContent?: TManifest[TName]["output"];
            metadata?: { toolName?: TName };
          }
        >;
      }[keyof TManifest & string];

export type TypedPartCompletedEvent<TManifest extends ToolManifest> =
  | PartCompletedTextEvent
  | PartCompletedToolCallEvent<TManifest>
  | ManifestToolOutputEvent<TManifest>
  | PartCompletedToolOutputFallbackEvent;

export type PartCompleted = TypedPartCompletedEvent<ToolManifest>;

export type AgentKitEvent<TManifest extends ToolManifest = ToolManifest> =
  | RunStarted
  | RunCompleted
  | StreamEnded
  | PartCreated
  | TextDelta
  | ToolArgsDelta
  | ToolOutputDelta
  | TypedPartCompletedEvent<TManifest>
  | UnknownEvent;

type KnownEventNames =
  | "run.started"
  | "run.completed"
  | "stream.ended"
  | "part.created"
  | "text.delta"
  | "tool_call.arguments.delta"
  | "tool_call.output.delta"
  | "part.completed";

export type UnknownEvent = EventBase & {
  event: Exclude<string, KnownEventNames>;
  data: JsonObject;
};

export type RealtimeEvent<TManifest extends ToolManifest = ToolManifest> =
  AgentKitEvent<TManifest>;

// =============================================================================
// TOOL RESULT TYPING (GENERIC MANIFEST)
// =============================================================================

// Rich manifest describing tool input and output typings.
export type ToolManifest = Record<
  string,
  {
    input: unknown;
    output: unknown; // output shape is defined by the manifest (often ToolResultPayload<...>)
  }
>;

// Flattened tool result for DX: expose data directly in addition to raw output
export type TypedToolResult<TManifest extends ToolManifest> = {
  [TName in keyof TManifest]: {
    /** Name of the tool that produced this result */
    toolName: TName;
    /** Raw output object as produced by the tool (typically { data: T }) */
    output: TManifest[TName]["output"];
    /** Flattened data extracted from output when shape is { data: T } */
    data: TManifest[TName]["output"] extends { data: infer D } ? D : never;
    /** Tool input parameters if available from state at callback time */
    input?: TManifest[TName]["input"];
    /** Identifiers for correlating with message/part */
    partId: string;
    messageId: string;
  };
}[keyof TManifest];

// Common wrapper type for tool handler outputs
export type ToolResultPayload<T> = { data: T };

// =============================================================================
// CHAT REQUEST TYPES (Frontend/API payload and Inngest event)
// =============================================================================

/**
 * ChatRequestPayload is the request body shape sent from the frontend to your
 * API route responsible for triggering the chat. clientTimestamp may be a
 * Date on the client, but will serialize to a string on the wire.
 */
export interface ChatRequestPayload {
  userMessage: {
    id: string;
    content: string;
    role: "user";
    state?: Record<string, unknown>;
    clientTimestamp?: Date | string;
    systemPrompt?: string;
  };
  threadId?: string;
  history?: unknown[];
  userId?: string;
  channelKey?: string;
}

/**
 * ChatRequestEvent is the Inngest event data shape consumed by the function
 * that runs the agent/network. It mirrors ChatRequestPayload, but narrows
 * clientTimestamp to string to match typical event transport.
 */
export type ChatRequestEvent = Omit<ChatRequestPayload, "userMessage"> & {
  userMessage: Omit<ChatRequestPayload["userMessage"], "clientTimestamp"> & {
    clientTimestamp?: string;
  };
};

// =============================================================================
// Cross-tab BroadcastChannel message types
// =============================================================================

export type CrossTabMessage<TManifest extends ToolManifest = ToolManifest> =
  | { type: "evt"; sender: string; evt: RealtimeEvent<TManifest> }
  | { type: "state"; sender: string; state: InngestSubscriptionState }
  | { type: "snapshot:request"; sender: string; threadId: string }
  | {
      type: "snapshot:response";
      sender: string;
      threadId: string;
      events: RealtimeEvent[];
    };

// =============================================================================
// CORE CONVERSATION TYPES
// =============================================================================

/**
 * Union type representing all possible message parts that can appear in a conversation.
 * Each part type handles a specific kind of content or interaction within a message.
 */
export type MessagePart<TManifest extends ToolManifest = ToolManifest> =
  | TextUIPart
  | ToolCallUIPart<TManifest>
  | DataUIPart
  | FileUIPart
  | SourceUIPart
  | ReasoningUIPart
  | StatusUIPart
  | ErrorUIPart
  | HitlUIPart;

/**
 * Represents a text message part that can be streamed character by character.
 */
export interface TextUIPart {
  type: "text";
  /** Unique identifier for this text part */
  id: string;
  /** The text content, updated incrementally during streaming */
  content: string;
  /** Whether the text is still being streamed or is complete */
  status: "streaming" | "complete";
}

/**
 * Represents a tool call that the agent is making, with streaming input and output.
 */
type ToolCallUIPartForTool<
  TManifest extends ToolManifest,
  TName extends keyof TManifest & string,
> =
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: TName;
      state:
        | "input-streaming"
        | "input-available"
        | "awaiting-approval"
        | "executing";
      input: TManifest[TName]["input"];
      output?: TManifest[TName]["output"];
      error?: unknown;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: TName;
      state: "output-available";
      input: TManifest[TName]["input"];
      output: TManifest[TName]["output"];
      error?: unknown;
    };

export type ToolCallUIPart<TManifest extends ToolManifest = ToolManifest> =
  keyof TManifest extends never
    ? never
    : {
        [TName in keyof TManifest & string]: ToolCallUIPartForTool<
          TManifest,
          TName
        >;
      }[keyof TManifest & string];

/**
 * Represents structured data with optional custom UI rendering.
 */
export interface DataUIPart {
  type: "data";
  /** Unique identifier for this data part */
  id: string;
  /** Human-readable name for the data */
  name: string;
  /** The actual data payload */
  data: unknown;
  /** Optional custom UI metadata (framework-agnostic) */
  ui?: unknown;
}

/**
 * Represents a file attachment or reference.
 */
export interface FileUIPart {
  type: "file";
  /** Unique identifier for this file part */
  id: string;
  /** URL where the file can be accessed */
  url: string;
  /** MIME type of the file */
  mediaType: string;
  /** Optional human-readable title */
  title?: string;
  /** File size in bytes */
  size?: number;
}

/**
 * Represents a reference to an external source or document.
 */
export interface SourceUIPart {
  type: "source";
  /** Unique identifier for this source part */
  id: string;
  /** Type of source being referenced */
  subtype: "url" | "document";
  /** URL of the source, if applicable */
  url?: string;
  /** Human-readable title of the source */
  title: string;
  /** MIME type of the source content */
  mediaType?: string;
  /** Brief excerpt or summary from the source */
  excerpt?: string;
}

/**
 * Represents the agent's internal reasoning process, streamed to provide transparency.
 */
export interface ReasoningUIPart {
  type: "reasoning";
  /** Unique identifier for this reasoning part */
  id: string;
  /** Name of the agent doing the reasoning */
  agentName: string;
  /** The reasoning content, updated incrementally */
  content: string;
  /** Whether the reasoning is still being streamed */
  status: "streaming" | "complete";
}

/**
 * Represents status updates about the agent's current activity.
 */
export interface StatusUIPart {
  type: "status";
  /** Unique identifier for this status part */
  id: string;
  /** Current activity status of the agent */
  status:
    | "started"
    | "thinking"
    | "calling-tool"
    | "responding"
    | "completed"
    | "error";
  /** ID of the agent reporting this status */
  agentId?: string;
  /** Optional human-readable message */
  message?: string;
}

/**
 * Represents an error that occurred during agent execution.
 */
export interface ErrorUIPart {
  type: "error";
  /** Unique identifier for this error part */
  id: string;
  /** Error message describing what went wrong */
  error: string;
  /** ID of the agent that encountered the error */
  agentId?: string;
  /** Whether the user can retry the action that caused this error */
  recoverable?: boolean;
}

/**
 * Represents a human-in-the-loop approval request for potentially sensitive operations.
 */
export interface HitlUIPart {
  type: "hitl";
  /** Unique identifier for this HITL request */
  id: string;
  /** Array of tool calls awaiting approval */
  toolCalls: Array<{ toolName: string; toolInput: unknown }>;
  /** Current status of the approval request */
  status: "pending" | "approved" | "denied" | "expired";
  /** ISO timestamp when this request expires */
  expiresAt?: string;
  /** ID of the user who resolved this request */
  resolvedBy?: string;
  /** ISO timestamp when this request was resolved */
  resolvedAt?: string;
  /** Additional metadata about the request */
  metadata?: {
    /** Reason for requiring human approval */
    reason?: string;
    /** Risk level assessment */
    riskLevel?: "low" | "medium" | "high";
  };
}

/**
 * Core message interface representing a complete conversation message.
 *
 * This is the primary message format used throughout AgentKit React hooks.
 * Messages contain one or more "parts" that can include text, tool calls,
 * reasoning, errors, and other rich content types. This structure supports
 * real-time streaming where parts are built up incrementally.
 *
 * ## Message Parts
 *
 * Messages are composed of parts to support streaming and rich content:
 * - **Text Parts**: Streaming text content from agents
 * - **Tool Call Parts**: Function calls with streaming input/output
 * - **Reasoning Parts**: Agent thinking process (optional transparency)
 * - **Error Parts**: Error messages with recovery guidance
 * - **HITL Parts**: Human-in-the-loop approval requests
 *
 * ## Client State
 *
 * Each message can capture the client's UI state when it was sent,
 * enabling features like message editing with context restoration.
 *
 * @interface ConversationMessage
 * @example
 * ```typescript
 * const userMessage: ConversationMessage = {
 *   id: 'msg-123',
 *   role: 'user',
 *   parts: [{
 *     type: 'text',
 *     id: 'text-123',
 *     content: 'Hello, help me with billing',
 *     status: 'complete'
 *   }],
 *   timestamp: new Date(),
 *   status: 'sent',
 *   clientState: {
 *     currentPage: '/billing',
 *     formData: { accountId: '123' }
 *   }
 * };
 * ```
 */
export interface ConversationMessage<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
> {
  /** Unique identifier for this message */
  id: string;
  /** Whether this message is from the user or the assistant */
  role: "user" | "assistant";
  /** Array of message parts that make up the complete message */
  parts: MessagePart<TManifest>[];
  /** ID of the agent that created this message (for assistant messages) */
  agentId?: string;
  /** When this message was created */
  timestamp: Date;
  /** The status of the message, particularly for optimistic user messages */
  status?: "sending" | "sent" | "failed";
  /** Client state captured when this message was originally sent */
  clientState?: TState;
}

// =============================================================================
// DX HELPER TYPES
// =============================================================================

export type AgentConfig<
  M extends ToolManifest = ToolManifest,
  S = Record<string, unknown>,
> = {
  tools: M;
  state: S;
};

export type AgentMessage<C extends AgentConfig> = ConversationMessage<
  C["tools"],
  C["state"]
>;
export type AgentPart<C extends AgentConfig> = MessagePart<C["tools"]>;
export type AgentToolPart<C extends AgentConfig> = ToolCallUIPart<C["tools"]>;
export type AnyToolCallPart = ToolCallUIPart<ToolManifest>;

/**
 * Represents the current activity status of the agent.
 * Used to provide real-time feedback to users about what the agent is doing.
 */
export type AgentStatus =
  | "ready" // previously "idle"
  | "submitted" // previously "thinking"
  | "streaming" // previously "responding" or "calling-tool"
  | "error";

// =============================================================================
// TOOL UTILITY TYPE ALIASES (for UI ergonomics)
// =============================================================================

/** Tool name union extracted from AgentConfig's manifest */
export type ToolName<C extends AgentConfig> = keyof C["tools"] & string;

/** Tool input type for a specific tool in a config */
export type ToolInputOf<
  C extends AgentConfig,
  K extends ToolName<C>,
> = C["tools"][K]["input"];

/** Tool output wrapper type for a specific tool in a config */
export type ToolOutputOf<
  C extends AgentConfig,
  K extends ToolName<C>,
> = C["tools"][K]["output"];

/** Flattened ToolResultPayload data for a specific tool in a config */
export type ToolDataOf<
  C extends AgentConfig,
  K extends ToolName<C>,
> = C["tools"][K]["output"] extends { data: infer D } ? D : never;

/** Strongly-typed ToolCallUIPart for a specific tool in a config */
export type ToolPartFor<C extends AgentConfig, K extends ToolName<C>> =
  | (Omit<AgentToolPart<C>, "toolName" | "input" | "output"> & {
      toolName: K;
      input: ToolInputOf<C, K>;
      state: "output-available";
      output: ToolOutputOf<C, K>;
    })
  | (Omit<AgentToolPart<C>, "toolName" | "input" | "output" | "state"> & {
      toolName: K;
      input: ToolInputOf<C, K>;
      state:
        | "input-streaming"
        | "input-available"
        | "awaiting-approval"
        | "executing";
      output?: ToolOutputOf<C, K>;
    });

// =============================================================================
// THREAD TYPES
// =============================================================================

/**
 * Represents a conversation thread with metadata and status.
 */
export interface Thread {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  hasNewMessages?: boolean;
}

/**
 * Common pagination result for thread listings.
 */
export interface ThreadsPage {
  threads: Thread[];
  hasMore: boolean;
  total: number;
  nextCursorTimestamp?: string | null;
  nextCursorId?: string | null;
}

// =============================================================================
// ERROR HANDLING TYPES
// =============================================================================

/**
 * Rich error object with recovery guidance and classification.
 * Provides much better developer and user experience than simple string errors.
 */
export interface AgentError {
  /** Human-readable error message */
  message: string;
  /** Whether this error can be recovered from by retrying */
  recoverable: boolean;
  /** When this error occurred */
  timestamp: Date;
  /** Optional error code for programmatic handling */
  errorCode?: string;
  /** Optional suggestion for how to resolve this error */
  suggestion?: string;
}

/**
 * Utility function to classify errors based on response characteristics.
 * Provides recovery guidance and determines if the error is user-recoverable.
 */
export interface ErrorClassification {
  recoverable: boolean;
  suggestion?: string;
  errorCode?: string;
}

/**
 * Classifies an HTTP response error and provides recovery guidance.
 */
export function classifyError(response: Response): ErrorClassification {
  if (response.status >= 500) {
    return {
      recoverable: true,
      suggestion:
        "This appears to be a server issue. Please try again in a few moments.",
      errorCode: `HTTP_${response.status}`,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      recoverable: false,
      suggestion: "Authentication failed. Please check your credentials.",
      errorCode: `HTTP_${response.status}`,
    };
  }

  if (response.status >= 400) {
    return {
      recoverable: false,
      suggestion: "Please check your request and try again.",
      errorCode: `HTTP_${response.status}`,
    };
  }

  return {
    recoverable: true,
    errorCode: `HTTP_${response.status}`,
  };
}

/**
 * Creates an AgentError from an HTTP response or generic error.
 */
export function createAgentError(
  error: Error | Response | string,
  context?: string
): AgentError {
  const timestamp = new Date();

  if (error instanceof Response) {
    const classification = classifyError(error);
    return {
      message: `${context ? `${context}: ` : ""}HTTP ${error.status} - ${error.statusText}`,
      recoverable: classification.recoverable,
      timestamp,
      errorCode: classification.errorCode,
      suggestion: classification.suggestion,
    };
  }

  if (error instanceof Error) {
    return {
      message: `${context ? `${context}: ` : ""}${error.message}`,
      recoverable: true, // Most JavaScript errors are recoverable by retry
      timestamp,
      suggestion:
        "Please try again. If the problem persists, check your network connection.",
    };
  }

  // String error
  return {
    message: `${context ? `${context}: ` : ""}${error}`,
    recoverable: true,
    timestamp,
    suggestion:
      "Please try again. If the problem persists, check your network connection.",
  };
}

// =============================================================================
// DEBUG LOGGING UTILITIES
// =============================================================================

/**
 * Debug logger interface for consistent logging across hooks.
 */
export interface DebugLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Creates a standardized debug logger with consistent prefixes.
 * Only outputs when debug is enabled to avoid console spam in production.
 */
export function createDebugLogger(
  namespace: string,
  enabled: boolean
): DebugLogger {
  const prefix = `[AgentKit:${namespace}]`;

  return {
    log: enabled
      ? (...args: unknown[]) => console.log(prefix, ...args)
      : () => {},
    warn: enabled
      ? (...args: unknown[]) => console.warn(prefix, ...args)
      : () => {},
    error: enabled
      ? (...args: unknown[]) => console.error(prefix, ...args)
      : () => {},
  };
}

// =============================================================================
// STREAMING STATE TYPES
// =============================================================================

/**
 * Represents the state for a single conversation thread.
 * Each thread maintains its own messages, status, and event processing state.
 */
export interface ThreadState<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
> {
  // Core conversation
  /** The array of messages in this thread's conversation. */
  messages: ConversationMessage<TManifest, TState>[];

  // Event processing (per thread)
  /** A buffer for events that arrive out of order for this thread. */
  eventBuffer: Map<number, AgentKitEvent<TManifest>>;
  /** The next sequence number this thread expects to process. */
  nextExpectedSequence: number;

  // UI state (per thread)
  /** The current status of the agent for this thread. */
  agentStatus: AgentStatus;
  /** The name of the agent currently processing requests for this thread. */
  currentAgent?: string;
  /** Whether this thread has new messages since last viewed. */
  hasNewMessages: boolean;
  /** Timestamp of the last activity in this thread. */
  lastActivity: Date;
  /** Whether initial history has been loaded at least once for this thread. */
  historyLoaded?: boolean;
  /** Whether a run is currently active for this thread (from run.started to run.completed/stream.ended). */
  runActive?: boolean;

  // Error handling (per thread)
  /** Thread-specific error information. */
  error?: {
    message: string;
    timestamp: Date;
    recoverable: boolean;
  };
}

/**
 * Represents the complete state of the agent interaction across multiple threads.
 * Manages multiple conversation threads simultaneously with background streaming.
 */
export interface StreamingState<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
> {
  // Multi-thread management
  /** All active threads indexed by threadId */
  threads: Record<string, ThreadState<TManifest, TState>>;
  /** The currently active/displayed thread ID */
  currentThreadId: string;

  // Global event processing
  /** The index of the last message processed from the raw subscription data */
  lastProcessedIndex: number;

  // Global connection state
  /** Represents the connection status to the real-time event stream */
  isConnected: boolean;

  // Global error handling (connection-level errors)
  /** Connection-level error information */
  connectionError?: {
    message: string;
    timestamp: Date;
    recoverable: boolean;
  };
}

/**
 * Defines the set of actions that can be dispatched to the streaming reducer.
 * Each action represents a specific event that can change the multi-thread state.
 */
export type StreamingAction<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
> =
  /** Dispatched when new real-time messages are received (all threads, no filtering) */
  | { type: "REALTIME_MESSAGES_RECEIVED"; messages: AgentKitEvent<TManifest>[] }
  /** Dispatched when the connection state changes */
  | { type: "CONNECTION_STATE_CHANGED"; state: InngestSubscriptionState }
  /** Dispatched when switching the currently displayed thread */
  | { type: "SET_CURRENT_THREAD"; threadId: string }
  /** Dispatched when the user sends a message to a specific thread */
  | {
      type: "MESSAGE_SENT";
      threadId: string;
      message: string;
      messageId: string;
      clientState?: TState;
    }
  /** Dispatched when the message was successfully sent to the backend */
  | { type: "MESSAGE_SEND_SUCCESS"; threadId: string; messageId: string }
  /** Dispatched when the message failed to send to the backend */
  | {
      type: "MESSAGE_SEND_FAILED";
      threadId: string;
      messageId: string;
      error: string;
    }
  /** Dispatched after a user message is sent to prepare the thread for new responses */
  | { type: "RESET_FOR_NEW_TURN"; threadId: string }
  /** Dispatched when a thread-specific error occurs */
  | {
      type: "THREAD_ERROR";
      threadId: string;
      error: string;
      recoverable?: boolean;
    }
  /** Dispatched when a connection-level error occurs */
  | { type: "CONNECTION_ERROR"; error: string; recoverable?: boolean }
  /** Dispatched to clear error state for a specific thread */
  | { type: "CLEAR_THREAD_ERROR"; threadId: string }
  /** Dispatched to clear connection-level error */
  | { type: "CLEAR_CONNECTION_ERROR" }
  /** Dispatched to clear all messages from a specific thread */
  | { type: "CLEAR_THREAD_MESSAGES"; threadId: string }
  /** Dispatched to replace all messages in a specific thread (for loading history) */
  | {
      type: "REPLACE_THREAD_MESSAGES";
      threadId: string;
      messages: ConversationMessage<TManifest, TState>[];
    }
  /** Dispatched to mark a thread as viewed (clear hasNewMessages flag) */
  | { type: "MARK_THREAD_VIEWED"; threadId: string }
  /** Dispatched to create a new empty thread */
  | { type: "CREATE_THREAD"; threadId: string }
  /** Dispatched to remove a thread completely */
  | { type: "REMOVE_THREAD"; threadId: string };

// [Removed] Legacy UseAgentOptions type; use useAgents types in React layer
