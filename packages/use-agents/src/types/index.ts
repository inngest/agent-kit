
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

import { InngestSubscriptionState } from "@inngest/realtime/hooks";
import { type AgentTransport } from '../transport/transport.js';

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
export type NetworkEvent = AgentMessageChunk;

// =============================================================================
// CORE CONVERSATION TYPES
// =============================================================================

/**
 * Union type representing all possible message parts that can appear in a conversation.
 * Each part type handles a specific kind of content or interaction within a message.
 */
export type MessagePart =
  | TextUIPart
  | ToolCallUIPart
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
export interface ToolCallUIPart { 
  type: "tool-call"; 
  /** Unique identifier for this tool call */
  toolCallId: string; 
  /** Name of the tool being called */
  toolName: string; 
  /** Current state of the tool call execution */
  state: "input-streaming" | "input-available" | "awaiting-approval" | "executing" | "output-available"; 
  /** Tool input parameters, streamed incrementally */
  input: any; 
  /** Tool output result, if available */
  output?: any; 
  /** Error information if the tool call failed */
  error?: any; 
}

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
  data: any; 
  /** Optional custom React component for rendering */
  ui?: React.ReactNode; 
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
  status: "started" | "thinking" | "calling-tool" | "responding" | "completed" | "error"; 
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
  toolCalls: Array<{ toolName: string; toolInput: any; }>; 
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
export interface ConversationMessage {
  /** Unique identifier for this message */
  id: string;
  /** Whether this message is from the user or the assistant */
  role: "user" | "assistant";
  /** Array of message parts that make up the complete message */
  parts: MessagePart[];
  /** ID of the agent that created this message (for assistant messages) */
  agentId?: string;
  /** When this message was created */
  timestamp: Date;
  /** The status of the message, particularly for optimistic user messages */
  status?: 'sending' | 'sent' | 'failed';
  /** Client state captured when this message was originally sent */
  clientState?: Record<string, unknown>;
}

/**
 * Represents the current activity status of the agent.
 * Used to provide real-time feedback to users about what the agent is doing.
 */
export type AgentStatus = "idle" | "thinking" | "calling-tool" | "responding" | "error";

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
      suggestion: "This appears to be a server issue. Please try again in a few moments.",
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
      message: `${context ? `${context}: ` : ''}HTTP ${error.status} - ${error.statusText}`,
      recoverable: classification.recoverable,
      timestamp,
      errorCode: classification.errorCode,
      suggestion: classification.suggestion,
    };
  }
  
  if (error instanceof Error) {
    return {
      message: `${context ? `${context}: ` : ''}${error.message}`,
      recoverable: true, // Most JavaScript errors are recoverable by retry
      timestamp,
      suggestion: "Please try again. If the problem persists, check your network connection.",
    };
  }
  
  // String error
  return {
    message: `${context ? `${context}: ` : ''}${error}`,
    recoverable: true,
    timestamp,
    suggestion: "Please try again. If the problem persists, check your network connection.",
  };
}

// =============================================================================
// DEBUG LOGGING UTILITIES
// =============================================================================

/**
 * Debug logger interface for consistent logging across hooks.
 */
export interface DebugLogger {
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

/**
 * Creates a standardized debug logger with consistent prefixes.
 * Only outputs when debug is enabled to avoid console spam in production.
 */
export function createDebugLogger(namespace: string, enabled: boolean): DebugLogger {
  const prefix = `[AgentKit:${namespace}]`;
  
  return {
    log: enabled
      ? (...args: any[]) => console.log(prefix, ...args)
      : () => {},
    warn: enabled
      ? (...args: any[]) => console.warn(prefix, ...args)
      : () => {},
    error: enabled
      ? (...args: any[]) => console.error(prefix, ...args)
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
export interface ThreadState {
  // Core conversation
  /** The array of messages in this thread's conversation. */
  messages: ConversationMessage[];
  
  // Event processing (per thread)
  /** A buffer for events that arrive out of order for this thread. */
  eventBuffer: Map<number, NetworkEvent>;
  /** The next sequence number this thread expects to process. */
  nextExpectedSequence: number | null;
  /** The highest sequence number this thread has processed (for deduplication). */
  lastProcessedSequence: number;
  
  // UI state (per thread)
  /** The current status of the agent for this thread. */
  agentStatus: AgentStatus;
  /** The name of the agent currently processing requests for this thread. */
  currentAgent?: string;
  /** Whether this thread has new messages since last viewed. */
  hasNewMessages: boolean;
  /** Timestamp of the last activity in this thread. */
  lastActivity: Date;
  
  // Error handling (per thread)
  /** Thread-specific error information. */
  error?: {
    message: string;
    timestamp: Date;
    recoverable: boolean;
  };
}

/**
 * Represents the complete multi-thread state of the agent interaction.
 * Manages multiple conversation threads simultaneously with background streaming.
 */
export interface MultiThreadStreamingState {
  // Multi-thread management
  /** All active threads indexed by threadId */
  threads: Record<string, ThreadState>;
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
 * Legacy interface for backward compatibility - points to current thread state
 * @deprecated Use MultiThreadStreamingState directly for new code
 */
export interface StreamingState {
  messages: ConversationMessage[];
  agentStatus: AgentStatus;
  currentAgent?: string;
  isConnected: boolean;
  error?: {
    message: string;
    timestamp: Date;
    recoverable: boolean;
  };
}

/**
 * Defines the set of actions that can be dispatched to the multi-thread streaming reducer.
 * Each action represents a specific event that can change the multi-thread state.
 */
export type MultiThreadStreamingAction =
  /** Dispatched when new real-time messages are received (all threads, no filtering) */
  | { type: 'REALTIME_MESSAGES_RECEIVED'; messages: any[] }
  /** Dispatched when the connection state changes */
  | { type: 'CONNECTION_STATE_CHANGED'; state: InngestSubscriptionState }
  /** Dispatched when switching the currently displayed thread */
  | { type: 'SET_CURRENT_THREAD'; threadId: string }
  /** Dispatched when the user sends a message to a specific thread */
  | { type: 'MESSAGE_SENT'; threadId: string; message: string; messageId: string; clientState?: Record<string, unknown> }
  /** Dispatched when the message was successfully sent to the backend */
  | { type: 'MESSAGE_SEND_SUCCESS'; threadId: string; messageId: string }
  /** Dispatched when the message failed to send to the backend */
  | { type: 'MESSAGE_SEND_FAILED'; threadId: string; messageId: string; error: string }
  /** Dispatched after a user message is sent to prepare the thread for new responses */
  | { type: 'RESET_FOR_NEW_TURN'; threadId: string }
  /** Dispatched when a thread-specific error occurs */
  | { type: 'THREAD_ERROR'; threadId: string; error: string; recoverable?: boolean }
  /** Dispatched when a connection-level error occurs */
  | { type: 'CONNECTION_ERROR'; error: string; recoverable?: boolean }
  /** Dispatched to clear error state for a specific thread */
  | { type: 'CLEAR_THREAD_ERROR'; threadId: string }
  /** Dispatched to clear connection-level error */
  | { type: 'CLEAR_CONNECTION_ERROR' }
  /** Dispatched to clear all messages from a specific thread */
  | { type: 'CLEAR_THREAD_MESSAGES'; threadId: string }
  /** Dispatched to replace all messages in a specific thread (for loading history) */
  | { type: 'REPLACE_THREAD_MESSAGES'; threadId: string; messages: ConversationMessage[] }
  /** Dispatched to mark a thread as viewed (clear hasNewMessages flag) */
  | { type: 'MARK_THREAD_VIEWED'; threadId: string }
  /** Dispatched to create a new empty thread */
  | { type: 'CREATE_THREAD'; threadId: string }
  /** Dispatched to remove a thread completely */
  | { type: 'REMOVE_THREAD'; threadId: string };

/**
 * Legacy action type for backward compatibility
 * @deprecated Use MultiThreadStreamingAction for new code
 */
export type StreamingAction = MultiThreadStreamingAction;

// =============================================================================
// HOOK OPTIONS & RETURN TYPES
// =============================================================================

/**
 * Configuration options for the useAgent hook.
 * 
 * These options control all aspects of agent interaction including connection
 * management, state capture, transport configuration, and debugging. The hook
 * supports both simple usage (minimal config) and advanced scenarios (full customization).
 * 
 * ## Configuration Hierarchy
 * 
 * 1. **Hook Options**: Direct parameters passed to useAgent (highest priority)
 * 2. **Provider Options**: Inherited from AgentProvider if available
 * 3. **Defaults**: Built-in fallbacks for anonymous users and default transports
 * 
 * @interface UseAgentOptions
 * @example
 * ```typescript
 * // Minimal configuration
 * const minimal = useAgent({
 *   threadId: 'conversation-123'
 * });
 * 
 * // Full configuration
 * const advanced = useAgent({
 *   threadId: 'conversation-123',
 *   userId: 'user-456',
 *   channelKey: 'project-789', // For collaboration
 *   debug: true,
 *   state: () => ({
 *     currentTab: getCurrentTab(),
 *     formData: getFormData(),
 *     userPreferences: getUserPreferences()
 *   }),
 *   transport: new CustomAgentTransport(),
 *   onError: (error) => {
 *     console.error('Agent error:', error);
 *     showErrorNotification(error.message);
 *   }
 * });
 * ```
 */
export interface UseAgentOptions {
  /** The unique identifier for the conversation thread. */
  threadId: string;
  /** Channel key for subscription (flexible - enables collaborative features) */
  channelKey?: string;
  /** The user identifier for attribution and data ownership (optional - can be anonymous). */
  userId?: string;
  /** An optional callback for handling errors. */
  onError?: (error: Error) => void;
  /** 
   * Enable debug logging for this agent instance. 
   * When true, detailed console logs will be output for debugging purposes.
   * Defaults to true in development, false in production.
   */
  debug?: boolean;
  
  /**
   * Optional function to capture client-side state when sending messages.
   * This state will be included in the UserMessage object and can be persisted
   * for debugging, regeneration, and enhanced context.
   * 
   * @returns Object containing any client-side state to be captured
   * 
   * @example
   * ```typescript
   * state: () => ({
   *   formData: currentFormState,
   *   selectedItems: selectedIds,
   *   uiMode: currentMode,
   *   filters: activeFilters
   * })
   * ```
   */
  state?: () => Record<string, unknown>;
  
  /**
   * Optional transport instance for making API calls.
   * If not provided, a default transport with conventional endpoints will be used.
   * This allows customization of endpoints, headers, and request logic.
   */
  transport?: AgentTransport;
  
  /**
   * Internal flag to disable this useAgent instance when used as an unused fallback.
   * This prevents double subscriptions when both provider and local agents exist.
   * @internal
   */
  __disableSubscription?: boolean;
}