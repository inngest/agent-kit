"use client";

import { useEffect, useReducer, useCallback } from "react";
import { useInngestSubscription, InngestSubscriptionState } from "@inngest/realtime/hooks";

// ----- DATA & UI MODELS (As per spec) -----------------------------

interface NetworkEvent {
  event: string;
  data: any;
  timestamp: number;
  sequenceNumber: number;
}

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
export interface TextUIPart { type: "text"; id: string; content: string; status: "streaming" | "complete"; }
export interface ToolCallUIPart { type: "tool-call"; toolCallId: string; toolName: string; state: "input-streaming" | "input-available" | "awaiting-approval" | "executing" | "output-available"; input: any; output?: any; error?: any; }
export interface DataUIPart { type: "data"; id: string; name: string; data: any; ui?: React.ReactNode; }
export interface FileUIPart { type: "file"; id: string; url: string; mediaType: string; title?: string; size?: number; }
export interface SourceUIPart { type: "source"; id: string; subtype: "url" | "document"; url?: string; title: string; mediaType?: string; excerpt?: string; }
export interface ReasoningUIPart { type: "reasoning"; id: string; agentName: string; content: string; status: "streaming" | "complete"; }
export interface StatusUIPart { type: "status"; id: string; status: "started" | "thinking" | "calling-tool" | "responding" | "completed" | "error"; agentId?: string; message?: string; }
export interface ErrorUIPart { type: "error"; id: string; error: string; agentId?: string; recoverable?: boolean; }
export interface HitlUIPart { type: "hitl"; id: string; toolCalls: Array<{ toolName: string; toolInput: any; }>; status: "pending" | "approved" | "denied" | "expired"; expiresAt?: string; resolvedBy?: string; resolvedAt?: string; metadata?: { reason?: string; riskLevel?: "low" | "medium" | "high"; }; }

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  agentId?: string;
  timestamp: Date;
}

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
 * @param messages The array of `ConversationMessage` from the UI state.
 * @returns A simplified array of messages for the agent's context.
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
 * @param messages The array of messages to search.
 * @param messageId The ID of the message to find.
 * @returns The found `ConversationMessage` or `undefined`.
 */
const findMessage = (messages: ConversationMessage[], messageId: string): ConversationMessage | undefined => {
  return messages.find(m => m.id === messageId);
};

/**
 * A pure utility function to find a specific message part (e.g., a text block or a tool call)
 * within a specific message.
 * @param messages The array of all messages.
 * @param messageId The ID of the message containing the part.
 * @param partId The ID of the part to find.
 * @returns The found `MessagePart` or `undefined`.
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
 * This is necessary because multiple events can relate to the same assistant response.
 * @param messages The current array of messages.
 * @param eventData The data from the incoming `NetworkEvent`.
 * @returns An object containing the new array of messages and the target assistant message.
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
 * `messages` array immutably.
 * @param messages The current array of `ConversationMessage`.
 * @param event The `NetworkEvent` to process.
 * @returns A new, updated array of `ConversationMessage`.
 */
const processEvent = (messages: ConversationMessage[], event: NetworkEvent): ConversationMessage[] => {
  console.log("[StreamingReducer] Processing event:", event);
  
  switch (event.event) {
    // An agent run has started. We find or create the assistant message
    // and update its agentId.
    case "run.started":
      if (event.data.scope === "agent") {
        const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
        const updatedMessage = { ...message, agentId: event.data.name };
        return newMessages.map(m => m.id === message.id ? updatedMessage : m);
      }
      return messages;
      
    // A new part of a message is being created (e.g., a text block or tool call).
    case "part.created": {
      console.log("[StreamingReducer] Creating new part:", {
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
        const updatedParts = [...message.parts];
        const targetIdx = [...updatedParts]
          .reverse()
          .findIndex((p) => p.type === "tool-call" && (p as ToolCallUIPart).toolName === (event.data.metadata?.toolName || "unknown"));
        if (targetIdx !== -1) {
          const realIdx = updatedParts.length - 1 - targetIdx;
          const toolPart = updatedParts[realIdx] as ToolCallUIPart;
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
        console.warn("[StreamingReducer] Text part NOT FOUND for delta:", {
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
      const lastToolIdx = [...msg.parts].reverse().findIndex(p => p.type === 'tool-call');
      if (lastToolIdx === -1) return messages;
      const realIdx = msg.parts.length - 1 - lastToolIdx;
      const part = msg.parts[realIdx] as ToolCallUIPart;
      return messages.map(m => {
        if (m.id !== msg.id) return m;
        const newParts = [...m.parts];
        const currentOutput = typeof part.output === 'string' ? part.output : '';
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
 * @param currentNext The sequence number the frontend currently expects.
 * @param incomingEvents The newly received events.
 * @returns `true` if a reset is detected, `false` otherwise.
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
 * This function is the core of the out-of-order event handling.
 * @param state The current `StreamingState`.
 * @returns A new `StreamingState` after processing any contiguous events from the buffer.
 */
const processBufferedEvents = (state: StreamingState): StreamingState => {
  if (state.nextExpectedSequence === null) return state;
  
  let newState = { ...state };
  let processedCount = 0;
  let currentSequence = newState.nextExpectedSequence;
  
  // Loop as long as the next expected event is in our buffer.
  while (currentSequence !== null && newState.eventBuffer.has(currentSequence)) {
    const event = newState.eventBuffer.get(currentSequence)!;
    
    // Process the event to update the messages array.
    newState.messages = processEvent(newState.messages, event);
    
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
    console.log(`[StreamingReducer] Processed ${processedCount} events, next expected: ${newState.nextExpectedSequence}, buffered: ${newState.eventBuffer.size}`);
  }
  
  return newState;
};

/**
 * A pure function that updates the `agentStatus` and `currentAgent` based on the
 * event that was just processed.
 * @param state The current `StreamingState`.
 * @param event The `NetworkEvent` that was just processed.
 * @returns A new `StreamingState` with the updated status.
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
 * The initial state for the `streamingReducer`. This is the state of the hook
 * before any events have been received.
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
 * The main reducer for managing the state of the agent interaction. It's a pure
 * function that takes the current state and an action, and returns the new state.
 * All state transitions in the hook are handled by this reducer.
 * @param state The current `StreamingState`.
 * @param action The `StreamingAction` to process.
 * @returns The new `StreamingState`.
 */
const streamingReducer = (state: StreamingState, action: StreamingAction): StreamingState => {
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

      console.log("[useAgent] Processing new realtime events:", {
        totalEvents: action.messages.length,
        newEventCount: newEvents.length,
        lastProcessedIndex: state.lastProcessedIndex,
        nextSeqExpected: state.nextExpectedSequence,
      });

      // Check for a sequence reset, which indicates a new turn.
      let newState = state;
      if (detectSequenceReset(state.nextExpectedSequence, newEvents)) {
        console.log("[StreamingReducer] Detected sequence reset, clearing buffer");
        newState = {
          ...state,
          eventBuffer: new Map(),
          nextExpectedSequence: 0,
        };
      }
      
      // Add new events to the buffer for ordering.
      const newBuffer = new Map(newState.eventBuffer);
      newEvents.forEach(event => {
        newBuffer.set(event.sequenceNumber, event);
      });
      
      // If this is the first event, set the initial sequence number.
      const nextExpected = newState.nextExpectedSequence ?? 
        Math.min(...newEvents.map(e => e.sequenceNumber));
      
      const finalState = {
        ...newState,
        eventBuffer: newBuffer,
        lastProcessedIndex: action.messages.length - 1,
        nextExpectedSequence: nextExpected
      };
      
      // Attempt to process any events from the buffer now that new events have arrived.
      return processBufferedEvents(finalState);
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
 * Options for the `useAgent` hook.
 */
export interface UseAgentOptions {
  /** The unique identifier for the conversation thread. */
  threadId: string;
  /** An optional callback for handling errors. */
  onError?: (error: Error) => void;
}

/**
 * The return value of the `useAgent` hook.
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
 * This hook encapsulates the logic for sending messages, receiving and processing
 * real-time events, and managing the conversation state.
 * @param {UseAgentOptions} options - The options for the hook.
 * @returns {UseAgentReturn} - The state and functions for interacting with the agent.
 */
export function useAgent({ threadId, onError }: UseAgentOptions): UseAgentReturn {
  const [state, dispatch] = useReducer(streamingReducer, initialState);

  // Subscribe to the Inngest real-time event stream.
  const { data: realtimeData, error: realtimeError, state: connectionState } = useInngestSubscription({
    // This function is called to get a token for the real-time subscription.
    // It should be secured in a production environment.
    refreshToken: async () => {
      console.log("[useAgent] Refreshing realtime token for thread:", threadId);
      const response = await fetch("/api/realtime/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      if (!response.ok) throw new Error("Failed to get subscription token");
      const token = await response.json();
      console.log("[useAgent] Got new realtime token:", { threadId, tokenReceived: !!token });
      return token;
    },
  });

  // Effect to process new real-time events when they arrive.
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
  useEffect(() => {
    dispatch({
      type: 'CONNECTION_STATE_CHANGED',
      state: connectionState
    });
  }, [connectionState]);

  // Effect to handle errors from the real-time subscription.
  useEffect(() => {
    if (realtimeError) {
      console.error("Realtime subscription error:", realtimeError);
      dispatch({
        type: 'ERROR',
        error: realtimeError.message || "Realtime connection error",
        recoverable: true
      });
      onError?.(realtimeError);
    }
  }, [realtimeError, onError]);

  // Callback for sending a message to the agent.
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    // 1. Format the current message history for the agent's context.
    const simpleHistory = formatMessagesToAgentKitHistory(state.messages);

    // 2. Optimistically update the UI with the user's message and reset for the new turn.
    dispatch({ type: 'MESSAGE_SENT', message });
    dispatch({ type: 'RESET_FOR_NEW_TURN' });

    // 3. Send the message and history to the backend.
    try {
      console.log("[useAgent] Sending message with history:", {
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
        console.error("API Error:", errorBody);
        throw new Error(errorBody.error?.message || "Failed to send message");
      }
    } catch (error) {
      console.error("[useAgent] Error sending message:", error);
      dispatch({
        type: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
        recoverable: true
      });
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [threadId, onError, state.messages]);

  // Callback to clear the current error.
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // Callback to regenerate the last response by resending the last user message
  const regenerate = useCallback(() => {
    const lastUserMessage = [...state.messages].reverse().find(msg => msg.role === 'user');
    if (lastUserMessage && lastUserMessage.parts.length > 0) {
      const lastUserContent = lastUserMessage.parts
        .filter(part => part.type === 'text')
        .map(part => (part as TextUIPart).content)
        .join(' ');
      
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
