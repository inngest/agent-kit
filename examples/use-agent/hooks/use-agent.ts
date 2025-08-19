"use client";

import { useEffect, useReducer, useCallback } from "react";
import { useInngestSubscription, InngestSubscriptionState } from "@inngest/realtime/hooks";

// ----- DEBUG CONFIGURATION ------------------------------------------

/**
 * Default debug configuration for the useAgent hook.
 * Defaults to true in development, false in production.
 * Can be overridden by passing debug option to useAgent.
 * 
 * @constant
 */
const DEFAULT_DEBUG_MODE = process.env.NODE_ENV === 'development';

/**
 * Conditional debug logger that only outputs when debug flag is enabled.
 * Provides the same interface as console.log but respects the debug flag.
 * 
 * @param isDebugEnabled - Whether debug logging is enabled
 * @param args - Arguments to pass to console.log
 */
const debugLog = (isDebugEnabled: boolean, ...args: any[]) => {
  if (isDebugEnabled) {
    console.log(...args);
  }
};

/**
 * Conditional debug warn logger that only outputs when debug flag is enabled.
 * Provides the same interface as console.warn but respects the debug flag.
 * 
 * @param isDebugEnabled - Whether debug logging is enabled
 * @param args - Arguments to pass to console.warn
 */
const debugWarn = (isDebugEnabled: boolean, ...args: any[]) => {
  if (isDebugEnabled) {
    console.warn(...args);
  }
};

/**
 * Conditional debug error logger that only outputs when debug flag is enabled.
 * Provides the same interface as console.error but respects the debug flag.
 * 
 * @param isDebugEnabled - Whether debug logging is enabled
 * @param args - Arguments to pass to console.error
 */
const debugError = (isDebugEnabled: boolean, ...args: any[]) => {
  if (isDebugEnabled) {
    console.error(...args);
  }
};

// ----- DATA & UI MODELS (As per spec) -----------------------------

/**
 * Represents a single event received from the real-time network stream.
 * These events contain information about agent actions, message updates, and status changes.
 * @interface NetworkEvent
 */
interface NetworkEvent {
  /** The type of event (e.g., "run.started", "part.created", "text.delta") */
  event: string;
  /** Event-specific data payload containing relevant information */
  data: any;
  /** Unix timestamp when the event was created */
  timestamp: number;
  /** Sequential number for ordering events within a conversation turn */
  sequenceNumber: number;
}

/**
 * Union type representing all possible message parts that can appear in a conversation.
 * Each part type handles a specific kind of content or interaction within a message.
 * @type MessagePart
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

// Part Types

/** 
 * Represents a text message part that can be streamed character by character.
 * @interface TextUIPart
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
 * @interface ToolCallUIPart
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
 * @interface DataUIPart
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
 * @interface FileUIPart
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
 * @interface SourceUIPart
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
 * @interface ReasoningUIPart
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
 * @interface StatusUIPart
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
 * @interface ErrorUIPart
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
 * @interface HitlUIPart
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
 * Represents a complete message in the conversation, containing one or more parts.
 * Messages can be from either the user or the assistant, with rich content support.
 * @interface ConversationMessage
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
}

/**
 * Represents the current activity status of the agent.
 * Used to provide real-time feedback to users about what the agent is doing.
 * @type AgentStatus
 */
export type AgentStatus = "idle" | "thinking" | "calling-tool" | "responding" | "error";

// ----- STREAMING STATE & ACTIONS ---------------------------------

/**
 * Represents the complete state of the agent interaction at any given time.
 * Managed by the `streamingReducer` to ensure predictable state transitions.
 * This state is immutable; any changes result in a new state object.
 */
interface StreamingState {
  // Core conversation
  /** The array of messages in the conversation, both from the user and the assistant. */
  messages: ConversationMessage[];
  
  // Event processing
  /** A buffer for events that arrive out of order. Keyed by sequence number. */
  eventBuffer: Map<number, NetworkEvent>;
  /** The next sequence number the hook expects to process. Null if we haven't received any events yet. */
  nextExpectedSequence: number | null;
  /** The index of the last message processed from the raw `realtimeData` array from `useInngestSubscription`. */
  lastProcessedIndex: number;
  
  // UI state
  /** The current status of the agent, used to display UI feedback (e.g., "thinking", "responding"). */
  agentStatus: AgentStatus;
  /** The name of the agent currently processing the request. */
  currentAgent?: string;
  /** Represents the connection status to the real-time event stream. */
  isConnected: boolean;
  
  // Error handling
  /** Holds information about the last error that occurred, if any. */
  error?: {
    message: string;
    timestamp: Date;
    recoverable: boolean;
  };
}

/**
 * Defines the set of actions that can be dispatched to the `streamingReducer`.
 * Each action represents a specific event that can change the `StreamingState`.
 */
type StreamingAction =
  /** Dispatched when new real-time messages are received from the Inngest subscription. */
  | { type: 'REALTIME_MESSAGES_RECEIVED'; messages: any[] }
  /** Dispatched when the connection state of the real-time subscription changes. */
  | { type: 'CONNECTION_STATE_CHANGED'; state: InngestSubscriptionState }
  /** Dispatched when the user sends a new message. */
  | { type: 'MESSAGE_SENT'; message: string }
  /** Dispatched after a user message is sent to prepare for the next turn of agent responses. */
  | { type: 'RESET_FOR_NEW_TURN' }
  /** Dispatched when an error occurs, either from the API, real-time subscription, or agent execution. */
  | { type: 'ERROR'; error: string; recoverable?: boolean }
  /** Dispatched when the user dismisses an error message. */
  | { type: 'CLEAR_ERROR' };

// ----- PURE MESSAGE PROCESSING FUNCTIONS -------------------------

/**
 * A pure function that transforms the UI's rich `ConversationMessage` array
 * into the simplified history format expected by the AgentKit backend.
 * This is crucial for maintaining context between conversation turns.
 * 
 * The function extracts only the essential text content from each message,
 * filtering out streaming states, tool calls, and other UI-specific parts
 * that the agent doesn't need for context.
 * 
 * @param messages - The array of `ConversationMessage` from the UI state
 * @returns A simplified array of messages containing only role and text content
 * @example
 * ```typescript
 * const uiMessages = [
 *   { role: 'user', parts: [{ type: 'text', content: 'Hello' }] },
 *   { role: 'assistant', parts: [{ type: 'text', content: 'Hi there!' }] }
 * ];
 * const history = formatMessagesToAgentKitHistory(uiMessages);
 * // Returns: [{ role: 'user', type: 'text', content: 'Hello' }, ...]
 * ```
 */
const formatMessagesToAgentKitHistory = (messages: ConversationMessage[]): { role: 'user' | 'assistant'; type: 'text'; content: string }[] => {
  return messages
    .map(msg => {
      // For user messages, find the first text part and use its content.
      if (msg.role === 'user') {
        const textPart = msg.parts.find(p => p.type === 'text') as TextUIPart;
        const content = textPart?.content || '';
        if (!content.trim()) return null;
        return { 
          type: 'text' as const, 
          role: 'user' as const, 
          content 
        };
      }
      // For assistant messages, concatenate all text parts.
      if (msg.role === 'assistant') {
        const content = msg.parts
          .filter(p => p.type === 'text')
          .map(p => (p as TextUIPart).content)
          .join('\n');
        if (!content.trim()) return null;
        return { 
          type: 'text' as const, 
          role: 'assistant' as const, 
          content 
        };
      }
      return null;
    })
    // Filter out any empty or unhandled messages.
    .filter((msg): msg is NonNullable<typeof msg> => msg !== null);
};

/**
 * A pure utility function to find a specific message by its ID within an array of messages.
 * This is used extensively during event processing to locate the correct message to update.
 * 
 * @param messages - The array of messages to search
 * @param messageId - The unique ID of the message to find
 * @returns The found `ConversationMessage` or `undefined` if not found
 * @example
 * ```typescript
 * const message = findMessage(messages, 'msg-123');
 * if (message) {
 *   console.log('Found message:', message.content);
 * }
 * ```
 */
const findMessage = (messages: ConversationMessage[], messageId: string): ConversationMessage | undefined => {
  return messages.find(m => m.id === messageId);
};

/**
 * A pure utility function to find a specific message part (e.g., a text block or a tool call)
 * within a specific message. This is essential for updating individual parts during streaming.
 * 
 * @param messages - The array of all messages to search within
 * @param messageId - The ID of the message containing the target part
 * @param partId - The unique ID or toolCallId of the part to find
 * @returns The found `MessagePart` or `undefined` if not found
 * @example
 * ```typescript
 * const textPart = findPart(messages, 'msg-123', 'text-456');
 * if (textPart && textPart.type === 'text') {
 *   console.log('Current text:', textPart.content);
 * }
 * ```
 */
const findPart = (messages: ConversationMessage[], messageId: string, partId: string): MessagePart | undefined => {
  const message = findMessage(messages, messageId);
  return message?.parts.find(p => 
    (p.type === 'text' && p.id === partId) || 
    (p.type === 'tool-call' && p.toolCallId === partId)
  );
};

/**
 * A pure function to either find an existing assistant message or create a new one.
 * This is necessary because multiple events can relate to the same assistant response,
 * and we need to ensure all parts are added to the correct message container.
 * 
 * If a message with the given ID already exists, it returns the existing message.
 * Otherwise, it creates a new assistant message and adds it to the array.
 * 
 * @param messages - The current array of messages
 * @param eventData - The data payload from the incoming `NetworkEvent`
 * @returns An object containing the updated messages array and the target message
 * @example
 * ```typescript
 * const { messages: updatedMessages, message } = getOrCreateAssistantMessage(
 *   currentMessages, 
 *   { messageId: 'msg-123', agentName: 'CodeAssistant' }
 * );
 * // message is either existing or newly created
 * ```
 */
const getOrCreateAssistantMessage = (
  messages: ConversationMessage[], 
  eventData: any
): { messages: ConversationMessage[]; message: ConversationMessage } => {
  const messageId = eventData.messageId || `msg-${Date.now()}`;
  
  // Try to find an existing message to append to.
  const existingMessage = findMessage(messages, messageId);
  if (existingMessage) {
    return { messages, message: existingMessage };
  }
  
  // If no message exists, create and add a new one.
  const newMessage: ConversationMessage = {
    id: messageId,
    role: 'assistant',
    parts: [],
    agentId: eventData.name || eventData.metadata?.agentName,
    timestamp: new Date(),
  };
  
  return { 
    messages: [...messages, newMessage], 
    message: newMessage 
  };
};

/**
 * The core pure function for processing a single `NetworkEvent` and updating the
 * `messages` array immutably. This function handles all types of streaming events
 * from the agent, including text deltas, tool calls, errors, and status updates.
 * 
 * Each event type has specific handling logic:
 * - `run.started`: Initializes agent execution
 * - `part.created`: Creates new message parts (text, tool calls)
 * - `text.delta`: Appends streaming text content
 * - `tool_call.arguments.delta`: Streams tool call arguments
 * - `tool_call.output.delta`: Streams tool execution results
 * - `part.completed`: Finalizes streaming parts
 * - `error`: Adds error information to messages
 * 
 * @param messages - The current immutable array of conversation messages
 * @param event - The network event to process and apply
 * @param isDebugEnabled - Whether to output debug logging for this processing
 * @returns A new, updated array of messages with the event applied
 * @throws Never throws - handles all event types gracefully
 * @example
 * ```typescript
 * const updatedMessages = processEvent(currentMessages, {
 *   event: 'text.delta',
 *   data: { messageId: 'msg-123', partId: 'text-456', delta: 'Hello' },
 *   timestamp: Date.now(),
 *   sequenceNumber: 5
 * }, true);
 * ```
 */
const processEvent = (messages: ConversationMessage[], event: NetworkEvent, isDebugEnabled: boolean = false): ConversationMessage[] => {
  debugLog(isDebugEnabled, "[StreamingReducer] Processing event:", event);
  
  switch (event.event) {
    // An agent run has started. We find or create the assistant message
    // and update its agentId.
    case "run.started":
      if (event.data.scope === "agent") {
        const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
        // Set the agent ID to track which agent is handling this message
        const updatedMessage = { ...message, agentId: event.data.name };
        return newMessages.map(m => m.id === message.id ? updatedMessage : m);
      }
      return messages;
      
    // A new part of a message is being created (e.g., a text block or tool call).
    case "part.created": {
      debugLog(isDebugEnabled, "[StreamingReducer] Creating new part:", {
        partId: event.data.partId,
        messageId: event.data.messageId,
        type: event.data.type,
        eventTimestamp: event.timestamp,
        eventSequence: event.sequenceNumber
      });
      
      const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
      
      let newPart: MessagePart;
      if (event.data.type === "text") {
        // Create an empty text part, which will be filled by 'text.delta' events.
        newPart = {
          type: "text",
          id: event.data.partId,
          content: "",
          status: "streaming",
        };
      } else if (event.data.type === "tool-call") {
        // Create an empty tool-call part, to be filled later.
        newPart = {
          type: "tool-call",
          toolCallId: event.data.partId,
          toolName: event.data.metadata?.toolName || "unknown",
          input: "",
          state: "input-streaming",
        };
      } else if (event.data.type === "tool-output") {
        // Initialize output streaming on the last tool-call part for this tool
        // We search in reverse to find the most recent tool call of this type
        const updatedParts = [...message.parts];
        const targetIdx = [...updatedParts]
          .reverse()
          .findIndex((p) => p.type === "tool-call" && (p as ToolCallUIPart).toolName === (event.data.metadata?.toolName || "unknown"));
        if (targetIdx !== -1) {
          // Convert reverse index back to normal array index
          const realIdx = updatedParts.length - 1 - targetIdx;
          const toolPart = updatedParts[realIdx] as ToolCallUIPart;
          // Initialize empty output and update state if still streaming input
          updatedParts[realIdx] = { ...toolPart, output: "", state: toolPart.state === "input-streaming" ? "executing" : toolPart.state };
          const updatedMessage2 = { ...message, parts: updatedParts };
          return newMessages.map(m => m.id === message.id ? updatedMessage2 : m);
        }
        return newMessages;
      } else {
        // If it's an unknown part type, do nothing.
        return newMessages;
      }
      
      // Add the new part to the correct message.
      const updatedMessage = {
        ...message,
        parts: [...message.parts, newPart]
      };
      
      return newMessages.map(m => m.id === message.id ? updatedMessage : m);
    }
    
    // A chunk of text has been streamed for a text part.
    case "text.delta": {
      const targetPart = findPart(messages, event.data.messageId, event.data.partId) as TextUIPart;
      if (!targetPart) {
        debugWarn(isDebugEnabled, "[StreamingReducer] Text part NOT FOUND for delta:", {
          searchedPartId: event.data.partId,
          messageId: event.data.messageId,
          availableMessages: messages.map(m => ({
            id: m.id,
            partsCount: m.parts.length,
            partIds: m.parts.map(p => p.type === 'text' ? p.id : p.type === 'tool-call' ? p.toolCallId : 'unknown')
          })),
          eventTimestamp: event.timestamp,
          eventSequence: event.sequenceNumber
        });
        return messages;
      }
      
      // Append the delta to the content of the correct text part.
      return messages.map(message => {
        if (message.id !== event.data.messageId) return message;
        
        return {
          ...message,
          parts: message.parts.map(part => {
            if (part.type === 'text' && part.id === event.data.partId) {
              return { ...part, content: part.content + event.data.delta };
            }
            return part;
          })
        };
      });
    }

    // A chunk of tool call arguments has been streamed.
    case "tool_call.arguments.delta": {
      const targetPart = findPart(messages, event.data.messageId, event.data.partId) as ToolCallUIPart;
      if (!targetPart || targetPart.type !== 'tool-call') return messages;
      return messages.map(message => {
        if (message.id !== event.data.messageId) return message;
        return {
          ...message,
          parts: message.parts.map(part => {
            if (part.type === 'tool-call' && part.toolCallId === event.data.partId) {
              const currentInput = typeof part.input === 'string' ? part.input : '';
              return { ...part, input: currentInput + (event.data.delta || ''), state: 'input-streaming' };
            }
            return part;
          })
        };
      });
    }

    // A chunk of tool output has been streamed.
    case "tool_call.output.delta": {
      // Find the most recent tool-call part to attach output
      const msg = findMessage(messages, event.data.messageId);
      if (!msg) return messages;
      // Search in reverse to find the last tool call (most recent)
      const lastToolIdx = [...msg.parts].reverse().findIndex(p => p.type === 'tool-call');
      if (lastToolIdx === -1) return messages;
      // Convert reverse index back to normal array index
      const realIdx = msg.parts.length - 1 - lastToolIdx;
      const part = msg.parts[realIdx] as ToolCallUIPart;
      return messages.map(m => {
        if (m.id !== msg.id) return m;
        const newParts = [...m.parts];
        // Ensure output is a string before concatenating
        const currentOutput = typeof part.output === 'string' ? part.output : '';
        // Append the delta and update state if transitioning from input streaming
        newParts[realIdx] = { ...part, output: currentOutput + (event.data.delta || ''), state: part.state === 'input-streaming' ? 'executing' : part.state };
        return { ...m, parts: newParts };
      });
    }
    
    // A message part has finished streaming.
    case "part.completed": {
      return messages.map(message => {
        if (message.id !== event.data.messageId) return message;
        
        return {
          ...message,
          parts: message.parts.map(part => {
            if ((part.type === 'text' && part.id === event.data.partId) || 
                (part.type === 'tool-call' && part.toolCallId === event.data.partId)) {
              
              // For text, set status to 'complete' and set the final content.
              if (part.type === 'text') {
                return { 
                  ...part, 
                  status: "complete" as const, 
                  content: event.data.finalContent 
                };
              // For tool-calls, set state to 'input-available' and set the final input.
              } else if (part.type === 'tool-call') {
                return { 
                  ...part, 
                  state: "input-available" as const, 
                  input: event.data.finalContent 
                };
              } else {
                return part;
              }
            }
            // Tool output completed -> mark tool-call output available
            if (part.type === 'tool-call' && event.data.type === 'tool-output') {
              const p = part as ToolCallUIPart;
              return { ...p, state: 'output-available', output: event.data.finalContent };
            }
            return part;
          })
        };
      });
    }
    
    // An error occurred during agent execution.
    case "error": {
      const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
      
      // Create a new error part and add it to the message.
      const errorPart: ErrorUIPart = {
        type: "error",
        id: `error-${Date.now()}`,
        error: event.data.error || "An unknown error occurred",
        agentId: event.data.agentId,
        recoverable: event.data.recoverable !== false,
      };
      
      const updatedMessage = {
        ...message,
        parts: [...message.parts, errorPart]
      };
      
      return newMessages.map(m => m.id === message.id ? updatedMessage : m);
    }
    
    // If the event type is unknown, return the state unchanged.
    default:
      return messages;
  }
};



// ----- SEQUENCE MANAGEMENT & BUFFER PROCESSING ------------------

/**
 * Detects if a sequence number reset has occurred. This is a crucial function
 * for handling multi-turn conversations, as the backend may reset its sequence
 * number at the beginning of a new turn.
 * 
 * A reset is identified when we expect a higher sequence number but receive
 * an event with sequence number 0, typically indicating a new conversation turn.
 * This helps maintain proper event ordering across multiple agent interactions.
 * 
 * @param currentNext - The sequence number the frontend currently expects next
 * @param incomingEvents - Array of newly received network events to check
 * @returns `true` if a sequence reset is detected, `false` otherwise
 * @example
 * ```typescript
 * const isReset = detectSequenceReset(10, [
 *   { sequenceNumber: 0, event: 'run.started', ... }
 * ]);
 * // Returns true - sequence jumped from expecting 10 to receiving 0
 * ```
 */
const detectSequenceReset = (
  currentNext: number | null, 
  incomingEvents: NetworkEvent[]
): boolean => {
  // A reset is detected if we have an expected sequence number, and an incoming event
  // has a sequence number of 0. This indicates a new turn.
  return incomingEvents.some(event => 
    currentNext !== null && 
    event.sequenceNumber === 0 && 
    (event.event === 'run.started' || event.event === 'part.created')
  );
};

/**
 * A pure function that processes events from the buffer in strict sequential order.
 * This function is the core of the out-of-order event handling system, ensuring
 * that events are applied to the message state in the correct sequence regardless
 * of when they arrive from the network.
 * 
 * The function processes events starting from `nextExpectedSequence` and continues
 * as long as consecutive sequence numbers are available in the buffer. This ensures
 * that messages are built correctly even when network events arrive out of order.
 * 
 * @param state - The current streaming state containing the event buffer
 * @param isDebugEnabled - Whether to output debug logging for this processing
 * @returns A new `StreamingState` with processed events removed from buffer
 * @example
 * ```typescript
 * // State has events 0, 1, 3 buffered, expecting sequence 0
 * const newState = processBufferedEvents(state, true);
 * // Processes events 0 and 1, stops at 2 (missing), expects sequence 2
 * ```
 */
const processBufferedEvents = (state: StreamingState, isDebugEnabled: boolean = false): StreamingState => {
  if (state.nextExpectedSequence === null) return state;
  
  let newState = { ...state };
  let processedCount = 0;
  let currentSequence = newState.nextExpectedSequence;
  
  // Loop as long as the next expected event is in our buffer.
  while (currentSequence !== null && newState.eventBuffer.has(currentSequence)) {
    const event = newState.eventBuffer.get(currentSequence)!;
    
    // Process the event to update the messages array.
    newState.messages = processEvent(newState.messages, event, isDebugEnabled);
    
    // Update the agent's status based on the event.
    newState = updateAgentStatus(newState, event);
    
    // Remove the processed event from the buffer and advance the sequence.
    newState.eventBuffer = new Map(newState.eventBuffer);
    newState.eventBuffer.delete(currentSequence);
    currentSequence++;
    processedCount++;
  }
  
  // Update the next expected sequence in the state.
  newState.nextExpectedSequence = currentSequence;
  
  if (processedCount > 0) {
    debugLog(isDebugEnabled, `[StreamingReducer] Processed ${processedCount} events, next expected: ${newState.nextExpectedSequence}, buffered: ${newState.eventBuffer.size}`);
  }
  
  return newState;
};

/**
 * A pure function that updates the `agentStatus` and `currentAgent` based on the
 * event that was just processed. This provides real-time feedback to the UI about
 * what the agent is currently doing.
 * 
 * Status transitions follow the agent lifecycle:
 * - `run.started` → "thinking" (agent begins processing)
 * - `part.created` (text) → "responding" (agent starts responding)
 * - `run.completed` → "idle" (agent finished)
 * - `error` → "error" (something went wrong)
 * 
 * @param state - The current streaming state
 * @param event - The network event that was just processed
 * @returns A new `StreamingState` with updated agent status and current agent
 * @example
 * ```typescript
 * const newState = updateAgentStatus(state, {
 *   event: 'run.started',
 *   data: { scope: 'agent', name: 'CodeAssistant' }
 * });
 * // newState.agentStatus === 'thinking'
 * // newState.currentAgent === 'CodeAssistant'
 * ```
 */
const updateAgentStatus = (state: StreamingState, event: NetworkEvent): StreamingState => {
  switch (event.event) {
    case "run.started":
      if (event.data.scope === 'agent') {
        return {
          ...state,
          agentStatus: "thinking",
          currentAgent: event.data.name
        };
      }
      return state;
      
    case "part.created":
      if (event.data.type === 'text') {
        return { ...state, agentStatus: "responding" };
      }
      return state;
      
    case "stream.ended":
    case "run.completed":
      if (event.data.scope === 'network') {
        return {
          ...state,
          agentStatus: "idle",
          currentAgent: undefined
        };
      }
      return state;
      
    case "error":
      return {
        ...state,
        agentStatus: "error",
        error: {
          message: event.data.error || "An unknown error occurred",
          timestamp: new Date(),
          recoverable: event.data.recoverable !== false
        }
      };
      
    default:
      return state;
  }
};

// ----- STREAMING REDUCER -----------------------------------------

/**
 * The initial state for the `streamingReducer`. This represents a clean slate
 * before any events have been received from the agent. All arrays and maps are
 * empty, and the agent is in an idle state with no active connections.
 * 
 * @constant
 * @type {StreamingState}
 */
const initialState: StreamingState = {
  messages: [],
  eventBuffer: new Map(),
  nextExpectedSequence: null,
  lastProcessedIndex: -1,
  agentStatus: "idle",
  isConnected: false,
  error: undefined,
};

/**
 * The main reducer for managing the state of the agent interaction. This is a pure
 * function that handles all state transitions in the useAgent hook, ensuring
 * predictable and debuggable state updates.
 * 
 * The reducer handles several types of actions:
 * - `REALTIME_MESSAGES_RECEIVED`: Processes new events from the stream
 * - `CONNECTION_STATE_CHANGED`: Updates connection status
 * - `MESSAGE_SENT`: Optimistically adds user messages
 * - `RESET_FOR_NEW_TURN`: Clears buffers for new conversation turns
 * - `ERROR`: Sets error state
 * - `CLEAR_ERROR`: Clears error state
 * 
 * All updates are immutable, returning new state objects rather than mutating existing ones.
 * 
 * @param state - The current `StreamingState`
 * @param action - The `StreamingAction` to process and apply
 * @param isDebugEnabled - Whether to output debug logging for this processing
 * @returns A new `StreamingState` with the action applied
 * @pure
 * @example
 * ```typescript
 * const newState = streamingReducer(currentState, {
 *   type: 'MESSAGE_SENT',
 *   message: 'Hello, agent!'
 * }, true);
 * // Returns new state with user message added
 * ```
 */
const streamingReducer = (state: StreamingState, action: StreamingAction, isDebugEnabled: boolean = false): StreamingState => {
  switch (action.type) {
    // This action handles all incoming real-time messages. It's the main entry
    // point for updating the conversation with the agent's responses.
    case 'REALTIME_MESSAGES_RECEIVED': {
      // Logic is in the reducer to prevent stale state issues in useEffect.
      if (action.messages.length <= state.lastProcessedIndex) {
        return state;
      }

      const newMessages = action.messages.slice(state.lastProcessedIndex + 1);
      const newEvents: NetworkEvent[] = newMessages
        .filter(message => message?.data?.event && message.data.sequenceNumber !== undefined)
        .map(message => message.data as NetworkEvent);

      if (newEvents.length === 0) {
        return {
          ...state,
          lastProcessedIndex: action.messages.length - 1
        };
      }

      debugLog(isDebugEnabled, "[useAgent] Processing new realtime events:", {
        totalEvents: action.messages.length,
        newEventCount: newEvents.length,
        lastProcessedIndex: state.lastProcessedIndex,
        nextSeqExpected: state.nextExpectedSequence,
      });

      // Check for a sequence reset, which indicates a new conversation turn.
      // This happens when the backend starts a new response and resets sequence numbers.
      let newState = state;
      if (detectSequenceReset(state.nextExpectedSequence, newEvents)) {
        debugLog(isDebugEnabled, "[StreamingReducer] Detected sequence reset, clearing buffer");
        newState = {
          ...state,
          eventBuffer: new Map(), // Clear the buffer since sequences are starting over
          nextExpectedSequence: 0, // Expect to start from sequence 0
        };
      }
      
      // Add new events to the buffer for ordering.
      // The buffer ensures events are processed in sequence even if they arrive out of order.
      const newBuffer = new Map(newState.eventBuffer);
      newEvents.forEach(event => {
        newBuffer.set(event.sequenceNumber, event);
      });
      
      // If this is the first event we've received, initialize the expected sequence
      // to the lowest sequence number in the incoming events.
      const nextExpected = newState.nextExpectedSequence ?? 
        Math.min(...newEvents.map(e => e.sequenceNumber));
      
      const finalState = {
        ...newState,
        eventBuffer: newBuffer,
        lastProcessedIndex: action.messages.length - 1,
        nextExpectedSequence: nextExpected
      };
      
      // Attempt to process any events from the buffer now that new events have arrived.
      return processBufferedEvents(finalState, isDebugEnabled);
    }
    
    // Updates the connection status.
    case 'CONNECTION_STATE_CHANGED': {
      return {
        ...state,
        isConnected: action.state === InngestSubscriptionState.Active
      };
    }
    
    // Handles the optimistic update when a user sends a message.
    case 'MESSAGE_SENT': {
      const userMessage: ConversationMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        parts: [{ 
          type: "text", 
          id: `text-${Date.now()}`, 
          content: action.message, 
          status: "complete" 
        }],
        timestamp: new Date(),
      };
      
      return {
        ...state,
        messages: [...state.messages, userMessage],
        agentStatus: "thinking",
        error: undefined // Clear any previous errors on new message send.
      };
    }
    
    // Resets the sequence and buffer for a new conversation turn.
    case 'RESET_FOR_NEW_TURN': {
      return {
        ...state,
        nextExpectedSequence: null,
        eventBuffer: new Map()
        // We keep lastProcessedIndex to avoid reprocessing old events from the subscription.
      };
    }
    
    // Sets the error state.
    case 'ERROR': {
      return {
        ...state,
        agentStatus: "error",
        error: {
          message: action.error,
          timestamp: new Date(),
          recoverable: action.recoverable ?? true
        }
      };
    }
    
    // Clears the error state.
    case 'CLEAR_ERROR': {
      return {
        ...state,
        error: undefined
      };
    }
    
    // Default case to satisfy the linter.
    default:
      return state;
  }
};

// ----- USE AGENT HOOK -------------------------------------------

/**
 * Configuration options for the `useAgent` hook.
 * These options control the behavior and callbacks of the agent interaction.
 * 
 * @interface UseAgentOptions
 */
export interface UseAgentOptions {
  /** The unique identifier for the conversation thread. */
  threadId: string;
  /** An optional callback for handling errors. */
  onError?: (error: Error) => void;
  /** 
   * Enable debug logging for this agent instance. 
   * When true, detailed console logs will be output for debugging purposes.
   * Defaults to true in development, false in production.
   */
  debug?: boolean;
}

/**
 * The return value of the `useAgent` hook, providing all necessary state and functions
 * for managing a real-time conversation with an AI agent.
 * 
 * @interface UseAgentReturn
 */
export interface UseAgentReturn {
  /** The array of messages in the conversation. */
  messages: ConversationMessage[];
  /** The current status of the agent. */
  status: AgentStatus;
  /** A function to send a message to the agent. */
  sendMessage: (message: string) => Promise<void>;
  /** A function to regenerate the last response by resending the last user message. */
  regenerate: () => void;
  /** The connection status to the real-time event stream. */
  isConnected: boolean;
  /** The name of the currently active agent. */
  currentAgent?: string;
  /** The last error that occurred, if any. */
  error?: { message: string; timestamp: Date; recoverable: boolean };
  /** A function to clear the current error. */
  clearError: () => void;
}

/**
 * A React hook for managing a real-time conversation with an AI agent.
 * This hook encapsulates the complete lifecycle of agent interactions, including
 * sending messages, receiving real-time streaming responses, handling out-of-order
 * events, and managing connection state.
 * 
 * The hook automatically handles:
 * - Real-time event streaming and buffering
 * - Out-of-order event processing with sequence numbers
 * - Connection state management
 * - Error handling and recovery
 * - Message history formatting for agent context
 * - Optimistic UI updates
 * 
 * @param options - Configuration options for the agent interaction
 * @param options.threadId - Unique identifier for the conversation thread
 * @param options.onError - Optional callback for handling errors
 * @returns Object containing conversation state and interaction functions
 * 
 * @example
 * ```typescript
 * function ChatComponent() {
 *   const {
 *     messages,
 *     status,
 *     sendMessage,
 *     isConnected,
 *     error,
 *     clearError
 *   } = useAgent({
 *     threadId: 'conversation-123',
 *     debug: true, // Enable debug logging for this instance
 *     onError: (error) => console.error('Agent error:', error)
 *   });
 * 
 *   return (
 *     <div>
 *       <div>Status: {status}</div>
 *       <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
 *       {messages.map(msg => <Message key={msg.id} message={msg} />)}
 *       <button onClick={() => sendMessage('Hello!')}>Send</button>
 *       {error && (
 *         <div>
 *           Error: {error.message}
 *           <button onClick={clearError}>Clear</button>
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAgent({ threadId, onError, debug = DEFAULT_DEBUG_MODE }: UseAgentOptions): UseAgentReturn {
  const [state, dispatch] = useReducer(
    (state: StreamingState, action: StreamingAction) => streamingReducer(state, action, debug), 
    initialState
  );

  // Subscribe to the Inngest real-time event stream.
  // This provides the low-level real-time connection to receive agent events.
  const { data: realtimeData, error: realtimeError, state: connectionState } = useInngestSubscription({
    // This function is called to get a token for the real-time subscription.
    // It should be secured in a production environment with proper authentication.
    refreshToken: async () => {
      debugLog(debug, "[useAgent] Refreshing realtime token for thread:", threadId);
      const response = await fetch("/api/realtime/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      if (!response.ok) throw new Error("Failed to get subscription token");
      const token = await response.json();
      debugLog(debug, "[useAgent] Got new realtime token:", { threadId, tokenReceived: !!token });
      return token;
    },
  });

  // Effect to process new real-time events when they arrive.
  // The reducer handles deduplication and ordering of events.
  useEffect(() => {
    if (realtimeData) {
      // We dispatch the entire array of messages to the reducer.
      // The reducer is responsible for figuring out which ones are new.
      dispatch({
        type: 'REALTIME_MESSAGES_RECEIVED',
        messages: realtimeData
      });
    }
  }, [realtimeData]);

  // Effect to update the connection status.
  // This provides UI feedback about the real-time connection state.
  useEffect(() => {
    dispatch({
      type: 'CONNECTION_STATE_CHANGED',
      state: connectionState
    });
  }, [connectionState]);

  // Effect to handle errors from the real-time subscription.
  // These are connection-level errors, not agent execution errors.
  useEffect(() => {
    if (realtimeError) {
      debugError(debug, "Realtime subscription error:", realtimeError);
      dispatch({
        type: 'ERROR',
        error: realtimeError.message || "Realtime connection error",
        recoverable: true
      });
      onError?.(realtimeError);
    }
  }, [realtimeError, onError]);

  /**
   * Callback for sending a message to the agent. This function handles the complete
   * flow of sending a user message, including optimistic UI updates, history formatting,
   * and error handling.
   * 
   * @param message - The user's message text to send to the agent
   * @returns Promise that resolves when the message is sent (not when response is received)
   */
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    // 1. Format the current message history for the agent's context.
    // This strips out UI-specific information and keeps only the essential context.
    const simpleHistory = formatMessagesToAgentKitHistory(state.messages);

    // 2. Optimistically update the UI with the user's message and reset for the new turn.
    // This provides immediate feedback while the request is being processed.
    dispatch({ type: 'MESSAGE_SENT', message });
    dispatch({ type: 'RESET_FOR_NEW_TURN' });

    // 3. Send the message and history to the backend.
    // The backend will process this and send real-time events back.
    try {
      debugLog(debug, "[useAgent] Sending message with history:", {
        message: message.substring(0, 50) + "...",
        threadId,
        historyLength: simpleHistory.length,
        historyPreview: simpleHistory.map((msg, i) => ({
          index: i,
          type: msg.type,
          role: msg.role,
          contentLength: msg.content.length,
          contentPreview: msg.content.substring(0, 30) + "..."
        }))
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, threadId, history: simpleHistory }),
      });
      if (!response.ok) {
        const errorBody = await response.json();
        debugError(debug, "API Error:", errorBody);
        throw new Error(errorBody.error?.message || "Failed to send message");
      }
    } catch (error) {
      debugError(debug, "[useAgent] Error sending message:", error);
      dispatch({
        type: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
        recoverable: true
      });
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [threadId, onError, state.messages]);

  /**
   * Callback to clear the current error state. This allows users to dismiss
   * error messages and return the agent to a normal state.
   * 
   * @returns void
   */
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  /**
   * Callback to regenerate the last response by resending the last user message.
   * This is useful when users want to retry getting a response from the agent,
   * for example if the previous response was unsatisfactory or incomplete.
   * 
   * The function finds the most recent user message in the conversation history
   * and resends it, triggering a new agent response.
   * 
   * @returns void
   */
  const regenerate = useCallback(() => {
    // Find the most recent user message in the conversation
    const lastUserMessage = [...state.messages].reverse().find(msg => msg.role === 'user');
    if (lastUserMessage && lastUserMessage.parts.length > 0) {
      // Extract all text content from the user message parts
      const lastUserContent = lastUserMessage.parts
        .filter(part => part.type === 'text')
        .map(part => (part as TextUIPart).content)
        .join(' ');
      
      // Only resend if there's actual content to send
      if (lastUserContent.trim()) {
        sendMessage(lastUserContent);
      }
    }
  }, [state.messages, sendMessage]);

  return {
    messages: state.messages,
    status: state.agentStatus,
    sendMessage,
    regenerate,
    isConnected: state.isConnected,
    currentAgent: state.currentAgent,
    error: state.error,
    clearError,
  };
}
