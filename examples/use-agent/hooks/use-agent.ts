"use client";

import { useEffect, useReducer, useCallback, useRef, useMemo } from "react";
import { useInngestSubscription, InngestSubscriptionState } from "@inngest/realtime/hooks";
import { v4 as uuidv4 } from 'uuid';
import { type AgentTransport, createDefaultAgentTransport } from './transport';
import { 
  useOptionalGlobalTransport, 
  useOptionalGlobalUserId, 
  useOptionalGlobalChannelKey,
  useOptionalGlobalResolvedChannelKey 
} from './utils/provider-utils';
import {
  type NetworkEvent,
  type MessagePart,
  type TextUIPart,
  type ToolCallUIPart,
  type DataUIPart,
  type FileUIPart,
  type SourceUIPart,
  type ReasoningUIPart,
  type StatusUIPart,
  type ErrorUIPart,
  type HitlUIPart,
  type ConversationMessage,
  type AgentStatus,
  type AgentError,
  type ThreadState,
  type MultiThreadStreamingState,
  type StreamingState,
  type MultiThreadStreamingAction,
  type StreamingAction,
  type UseAgentOptions,
  createDebugLogger,
} from './types';

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
 * Uses standardized AgentKit prefixes for consistency.
 * 
 * @param isDebugEnabled - Whether debug logging is enabled
 * @param args - Arguments to pass to console.log
 */
const debugLog = (isDebugEnabled: boolean, ...args: any[]) => {
  if (isDebugEnabled) {
    console.log('[AgentKit:useAgent]', ...args);
  }
};

/**
 * Conditional debug warn logger that only outputs when debug flag is enabled.
 * Uses standardized AgentKit prefixes for consistency.
 * 
 * @param isDebugEnabled - Whether debug logging is enabled
 * @param args - Arguments to pass to console.warn
 */
const debugWarn = (isDebugEnabled: boolean, ...args: any[]) => {
  if (isDebugEnabled) {
    console.warn('[AgentKit:useAgent]', ...args);
  }
};

/**
 * Conditional debug error logger that only outputs when debug flag is enabled.
 * Uses standardized AgentKit prefixes for consistency.
 * 
 * @param isDebugEnabled - Whether debug logging is enabled
 * @param args - Arguments to pass to console.error
 */
const debugError = (isDebugEnabled: boolean, ...args: any[]) => {
  if (isDebugEnabled) {
    console.error('[AgentKit:useAgent]', ...args);
  }
};

// Removed global diagnostics - no longer needed

// ----- DATA & UI MODELS (As per spec) -----------------------------

// All core types are now imported from ./types.ts
// This provides a single source of truth and prevents type drift

// ----- STREAMING STATE & ACTIONS ---------------------------------

// All streaming state and action types are now imported from ./types.ts
// This provides consistency across all hooks and prevents type drift

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
 * Creates a new message part based on the type and partId
 */
const createMessagePart = (type: string, partId: string): MessagePart => {
  switch (type) {
    case "text":
      return {
        type: "text",
        id: partId,
        content: "",
        status: "streaming",
      } as TextUIPart;
    case "tool-call":
      return {
        type: "tool-call",
        toolCallId: partId,
        toolName: "",
        state: "input-streaming",
        input: {},
        output: undefined,
        hitl: null,
      } as ToolCallUIPart;
    // Add other types as needed
    default:
      return {
        type: "text",
        id: partId,
        content: "",
        status: "streaming",
      } as TextUIPart;
  }
};

/**
 * Find a message part across all messages (wrapper around findPart)
 */
const findMessagePart = (messages: ConversationMessage[], partId: string): MessagePart | undefined => {
  for (const message of messages) {
    const part = message.parts.find(p => 
      (p.type === 'text' && p.id === partId) || 
      (p.type === 'tool-call' && (p as ToolCallUIPart).toolCallId === partId)
    );
    if (part) return part;
  }
  return undefined;
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
  debugLog(isDebugEnabled, `🔄 [PROCESS-EVENT] seq:${event.sequenceNumber} type:${event.event} threadId:${event.data && 'threadId' in event.data ? event.data.threadId : 'unknown'}`);
  
  switch (event.event) {
    // An agent run has started. We find or create the assistant message
    // and update its agentId.
    case "run.started":
      if (event.data.scope === "agent") {
        const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
        // Set the agent ID to track which agent is handling this message
        const agentName = typeof event.data.name === 'string' ? event.data.name : undefined;
        const updatedMessage = { ...message, agentId: agentName };
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
      
      // 🐛 DEBUG: Let's see what's happening with part.created events
      console.log(`🔍 [PART-CREATED-DEBUG] Event details:`, {
        event: event.event,
        sequenceNumber: event.sequenceNumber,
        partId: event.data.partId,
        messageId: event.data.messageId,
        partType: event.data.type,
        timestamp: event.timestamp,
        messagesCount: messages.length,
        metadata: event.data.metadata
      });
      
      const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
      
      console.log(`🔍 [PART-CREATED-DEBUG] Message creation result:`, {
        messageId: message.id,
        messageRole: message.role,
        wasNewMessage: newMessages.length > messages.length,
        currentPartsCount: message.parts.length,
        existingPartIds: message.parts.map(p => p.type === 'text' ? p.id : p.type === 'tool-call' ? p.toolCallId : 'unknown')
      });
      
      let newPart: MessagePart;
      if (event.data.type === "text") {
        // Create an empty text part, which will be filled by 'text.delta' events.
        const partId = typeof event.data.partId === 'string' ? event.data.partId : 'unknown';
        newPart = {
          type: "text",
          id: partId,
          content: "",
          status: "streaming",
        };
      } else if (event.data.type === "tool-call") {
        // Create an empty tool-call part, to be filled later.
        const partId = typeof event.data.partId === 'string' ? event.data.partId : 'unknown';
        const toolName = (event.data.metadata && typeof event.data.metadata === 'object' && event.data.metadata !== null && 'toolName' in event.data.metadata && typeof event.data.metadata.toolName === 'string') 
          ? event.data.metadata.toolName 
          : "unknown";
        newPart = {
          type: "tool-call",
          toolCallId: partId,
          toolName,
          input: "",
          state: "input-streaming",
        };
      } else if (event.data.type === "reasoning") {
        // Create an empty reasoning part, which will be filled by 'reasoning.delta' events.
        const partId = typeof event.data.partId === 'string' ? event.data.partId : 'unknown';
        const agentName = (event.data.metadata && typeof event.data.metadata === 'object' && event.data.metadata !== null && 'agentName' in event.data.metadata && typeof event.data.metadata.agentName === 'string') 
          ? event.data.metadata.agentName 
          : "unknown";
        newPart = {
          type: "reasoning",
          id: partId,
          agentName,
          content: "",
          status: "streaming",
        };
      } else if (event.data.type === "tool-output") {
        // Initialize output streaming on the last tool-call part for this tool
        // We search in reverse to find the most recent tool call of this type
        const updatedParts = [...message.parts];
        const metadataToolName = (event.data.metadata && typeof event.data.metadata === 'object' && event.data.metadata !== null && 'toolName' in event.data.metadata && typeof event.data.metadata.toolName === 'string') 
          ? event.data.metadata.toolName 
          : "unknown";
        const targetIdx = [...updatedParts]
          .reverse()
          .findIndex((p) => p.type === "tool-call" && (p as ToolCallUIPart).toolName === metadataToolName);
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
      debugLog(isDebugEnabled, `🔍 [TEXT-DELTA] Processing seq:${event.sequenceNumber} delta:"${event.data.delta}" partId:${event.data.partId}`);
      
      // 🐛 DEBUG: Let's see what's happening with text.delta events
      console.log(`🔍 [TEXT-DELTA-DEBUG] Event details:`, {
        event: event.event,
        sequenceNumber: event.sequenceNumber,
        partId: event.data.partId,
        messageId: event.data.messageId,
        delta: event.data.delta,
        timestamp: event.timestamp,
        messagesCount: messages.length
      });
      
      const messageId = typeof event.data.messageId === 'string' ? event.data.messageId : '';
      const partId = typeof event.data.partId === 'string' ? event.data.partId : '';
      const targetPart = findPart(messages, messageId, partId) as TextUIPart;
      if (!targetPart) {
        debugWarn(isDebugEnabled, "[StreamingReducer] Text part NOT FOUND for delta:", {
          searchedPartId: event.data.partId,
          messageId: event.data.messageId,
          eventTimestamp: event.timestamp,
          eventSequence: event.sequenceNumber
        });
        return messages;
      }
      
      // Append the delta to the content of the correct text part.
      return messages.map(message => {
        if (message.id !== messageId) return message;
        
        return {
          ...message,
          parts: message.parts.map(part => {
            if (part.type === 'text' && part.id === partId) {
              const beforeContent = part.content;
              const delta = typeof event.data.delta === 'string' ? event.data.delta : '';
              const newContent = beforeContent + delta;
              debugLog(isDebugEnabled, `🔍 [TEXT-DELTA] Applied delta seq:${event.sequenceNumber} "${delta}" | before:"${beforeContent}" after:"${newContent}"`);
              return { ...part, content: newContent };
            }
            return part;
          })
        };
      });
    }

    // A chunk of tool call arguments has been streamed.
    case "tool_call.arguments.delta": {
      const messageId = typeof event.data.messageId === 'string' ? event.data.messageId : '';
      const partId = typeof event.data.partId === 'string' ? event.data.partId : '';
      const targetPart = findPart(messages, messageId, partId) as ToolCallUIPart;
      if (!targetPart || targetPart.type !== 'tool-call') return messages;
      return messages.map(message => {
        if (message.id !== messageId) return message;
        const delta = typeof event.data.delta === 'string' ? event.data.delta : '';
        return {
          ...message,
          parts: message.parts.map(part => {
            if (part.type === 'tool-call' && part.toolCallId === partId) {
              const currentInput = typeof part.input === 'string' ? part.input : '';
              return { ...part, input: currentInput + delta, state: 'input-streaming' };
            }
            return part;
          })
        };
      });
    }

    // A chunk of tool output has been streamed.
    case "tool_call.output.delta": {
      // Find the most recent tool-call part to attach output
      const messageId = typeof event.data.messageId === 'string' ? event.data.messageId : '';
      const msg = findMessage(messages, messageId);
      if (!msg) return messages;
      // Search in reverse to find the last tool call (most recent)
      const lastToolIdx = [...msg.parts].reverse().findIndex(p => p.type === 'tool-call');
      if (lastToolIdx === -1) return messages;
      // Convert reverse index back to normal array index
      const realIdx = msg.parts.length - 1 - lastToolIdx;
      const part = msg.parts[realIdx] as ToolCallUIPart;
      const delta = typeof event.data.delta === 'string' ? event.data.delta : '';
      return messages.map(m => {
        if (m.id !== msg.id) return m;
        const newParts = [...m.parts];
        // Ensure output is a string before concatenating
        const currentOutput = typeof part.output === 'string' ? part.output : '';
        // Append the delta and update state if transitioning from input streaming
        newParts[realIdx] = { ...part, output: currentOutput + delta, state: part.state === 'input-streaming' ? 'executing' : part.state };
        return { ...m, parts: newParts };
      });
    }
    
    // A message part has finished streaming.
    case "part.completed": {
      const messageId = typeof event.data.messageId === 'string' ? event.data.messageId : '';
      const partId = typeof event.data.partId === 'string' ? event.data.partId : '';
      
      return messages.map(message => {
        if (message.id !== messageId) return message;
        
        return {
          ...message,
          parts: message.parts.map(part => {
            if ((part.type === 'text' && part.id === partId) || 
                (part.type === 'tool-call' && part.toolCallId === partId) ||
                (part.type === 'reasoning' && part.id === partId)) {
              
              // For text, set status to 'complete' and set the final content.
              if (part.type === 'text') {
                const finalText = typeof event.data.finalContent === 'string'
                  ? event.data.finalContent
                  : String(event.data.finalContent ?? '');
                return { 
                  ...part, 
                  status: "complete" as const, 
                  content: finalText 
                };
              // For tool-calls, set state to 'input-available' and set the final input.
              } else if (part.type === 'tool-call') {
                return { 
                  ...part, 
                  state: "input-available" as const, 
                  input: event.data.finalContent 
                };
              // For reasoning, set status to 'complete' and set the final content.
              } else if (part.type === 'reasoning') {
                const finalReasoning = typeof event.data.finalContent === 'string'
                  ? event.data.finalContent
                  : String(event.data.finalContent ?? '');
                return { 
                  ...part, 
                  status: "complete" as const, 
                  content: finalReasoning 
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
    
    // This case is handled by run.failed above - keeping for backward compatibility
    case "error": {
      const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
      
      // Create a new error part and add it to the message.
      const errorMessage = typeof event.data.error === 'string' ? event.data.error : "An unknown error occurred";
      const agentId = typeof event.data.agentId === 'string' ? event.data.agentId : undefined;
      const recoverable = typeof event.data.recoverable === 'boolean' ? event.data.recoverable : true;
      
      const errorPart: ErrorUIPart = {
        type: "error",
        id: `error-${Date.now()}`,
        error: errorMessage,
        agentId,
        recoverable,
      };
      
      const updatedMessage = {
        ...message,
        parts: [...message.parts, errorPart]
      };
      
      return newMessages.map(m => m.id === message.id ? updatedMessage : m);
    }

    // Agent run failed - create an error part
    case "run.failed": {
      const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
      
      // Create a new error part and add it to the message.
      const errorMessage = typeof event.data.error === 'string' ? event.data.error : "Agent run failed";
      const agentId = typeof event.data.name === 'string' ? event.data.name : undefined;
      const recoverable = typeof event.data.recoverable === 'boolean' ? event.data.recoverable : false;
      
      const errorPart: ErrorUIPart = {
        type: "error",
        id: `error-${Date.now()}`,
        error: errorMessage,
        agentId,
        recoverable,
      };
      
      const updatedMessage = {
        ...message,
        parts: [...message.parts, errorPart]
      };
      
      return newMessages.map(m => m.id === message.id ? updatedMessage : m);
    }

    // Reasoning content being streamed
    case "reasoning.delta": {
      const messageId = typeof event.data.messageId === 'string' ? event.data.messageId : '';
      const partId = typeof event.data.partId === 'string' ? event.data.partId : '';
      const delta = typeof event.data.delta === 'string' ? event.data.delta : '';
      
      return messages.map(message => {
        if (message.id !== messageId) return message;
        
        return {
          ...message,
          parts: message.parts.map(part => {
            if (part.type === 'reasoning' && part.id === partId) {
              return { ...part, content: part.content + delta };
            }
            return part;
          })
        };
      });
    }

    // Token usage updates (could be displayed in header or status)
    case "usage.updated": {
      // For now, we'll just pass through - could be used for token counters in UI
      debugLog(isDebugEnabled, "[StreamingReducer] Usage updated:", event.data.usage);
      return messages;
    }

    // Step lifecycle events (could be used for progress indicators)
    case "step.started": {
      debugLog(isDebugEnabled, "[StreamingReducer] Step started:", event.data.stepId);
      return messages;
    }

    case "step.completed": {
      debugLog(isDebugEnabled, "[StreamingReducer] Step completed:", event.data.stepId);
      return messages;
    }

    case "step.failed": {
      debugLog(isDebugEnabled, "[StreamingReducer] Step failed:", event.data.stepId, event.data.error);
      return messages;
    }

    // Human-in-the-loop approval requested
    case "hitl.requested": {
      const { messages: newMessages, message } = getOrCreateAssistantMessage(messages, event.data);
      
      // Safely extract HITL data
      const requestId = typeof event.data.requestId === 'string' ? event.data.requestId : `hitl-${Date.now()}`;
      const toolCalls = Array.isArray(event.data.toolCalls) 
        ? (event.data.toolCalls as Array<{ toolName: string; toolInput: any }>).map(tc => ({
            toolName: tc.toolName,
            toolInput: tc.toolInput,
          }))
        : [];
      const expiresAt = typeof event.data.expiresAt === 'string' ? event.data.expiresAt : undefined;
      const metadata = (event.data.metadata && typeof event.data.metadata === 'object' && event.data.metadata !== null) 
        ? event.data.metadata as { reason?: string; riskLevel?: "low" | "medium" | "high" }
        : undefined;
      
      // Create a HITL part for approval request
      const hitlPart: HitlUIPart = {
        type: "hitl",
        id: requestId,
        toolCalls,
        status: "pending",
        expiresAt,
        metadata,
      };
      
      const updatedMessage = {
        ...message,
        parts: [...message.parts, hitlPart]
      };
      
      return newMessages.map(m => m.id === message.id ? updatedMessage : m);
    }

    // Human-in-the-loop resolution
    case "hitl.resolved": {
      return messages.map(message => {
        return {
          ...message,
          parts: message.parts.map(part => {
            if (part.type === 'hitl' && part.id === event.data.requestId) {
              const resolution = typeof event.data.resolution === 'string' ? event.data.resolution as "approved" | "denied" : "denied";
              const resolvedBy = typeof event.data.resolvedBy === 'string' ? event.data.resolvedBy : undefined;
              const resolvedAt = typeof event.data.resolvedAt === 'string' ? event.data.resolvedAt : undefined;
              
              return { 
                ...part, 
                status: resolution,
                resolvedBy,
                resolvedAt,
              };
            }
            return part;
          })
        };
      });
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

// OLD FUNCTION REMOVED: processBufferedEvents - replaced by processThreadBufferedEvents

// OLD FUNCTION REMOVED: updateAgentStatus - replaced by processThreadEvent

// ----- STREAMING REDUCER -----------------------------------------

/**
 * The initial state for the `streamingReducer`. This represents a clean slate
 * before any events have been received from the agent. All arrays and maps are
 * empty, and the agent is in an idle state with no active connections.
 * 
 * @constant
 * @type {StreamingState}
 */
/**
 * Creates a new empty thread state with default values
 */
const createEmptyThreadState = (): ThreadState => ({
  messages: [],
  eventBuffer: new Map(),
  nextExpectedSequence: null,
  lastProcessedSequence: -1, // Start at -1 so first event (seq 0) gets processed
  agentStatus: "idle",
  currentAgent: undefined,
  hasNewMessages: false,
  lastActivity: new Date(),
  error: undefined,
});

/**
 * Creates initial multi-thread state with a single thread
 */
const createInitialMultiThreadState = (initialThreadId: string): MultiThreadStreamingState => ({
  threads: {
    [initialThreadId]: createEmptyThreadState(),
  },
  currentThreadId: initialThreadId,
  lastProcessedIndex: -1,
  isConnected: false,
  connectionError: undefined,
});

// Legacy initial state for backward compatibility
const initialState: StreamingState = {
  messages: [],
  agentStatus: "idle",
  currentAgent: undefined,
  isConnected: false,
  error: undefined,
};

/**
 * Helper function to ensure a thread exists in the state
 */
const ensureThread = (state: MultiThreadStreamingState, threadId: string): MultiThreadStreamingState => {
  if (!state.threads[threadId]) {
    return {
      ...state,
      threads: {
        ...state.threads,
        [threadId]: createEmptyThreadState(),
      },
    };
  }
  return state;
};

/**
 * Helper function to update a specific thread in the state
 */
const updateThread = (
  state: MultiThreadStreamingState, 
  threadId: string, 
  updates: Partial<ThreadState>
): MultiThreadStreamingState => {
  const ensuredState = ensureThread(state, threadId);
  const currentThread = ensuredState.threads[threadId];
  
  // Debug: Log message count changes and check for duplicates
  if (updates.messages !== undefined) {
    const beforeCount = currentThread.messages.length;
    const afterCount = updates.messages.length;
    
    // Log message count changes for debugging
    // Note: Removed auto-fix deduplication - duplicates should be prevented at source
    
    console.log(`🔍 [UPDATE-THREAD] Messages changing in thread ${threadId}: ${beforeCount} → ${afterCount}`);
    if (beforeCount > 0 && afterCount === 0) {
      console.warn(`🚨 [UPDATE-THREAD] WARNING: Messages were cleared in thread ${threadId}!`);
    }
  }
  
  return {
    ...ensuredState,
    threads: {
      ...ensuredState.threads,
      [threadId]: {
        ...ensuredState.threads[threadId],
        ...updates,
        lastActivity: new Date(),
      },
    },
  };
};

/**
 * The main reducer for managing multi-thread agent interactions. This is a pure
 * function that handles all state transitions, ensuring predictable and debuggable
 * state updates across multiple conversation threads simultaneously.
 * 
 * Key features:
 * - Multi-thread state management with background streaming
 * - Event routing to correct thread buffers based on threadId
 * - Per-thread status, error handling, and message management
 * - Backward compatibility with single-thread API
 * 
 * @param state - The current multi-thread streaming state
 * @param action - The action to process and apply
 * @param isDebugEnabled - Whether to output debug logging
 * @returns A new state with the action applied
 * @pure
 */
const multiThreadStreamingReducer = (
  state: MultiThreadStreamingState, 
  action: MultiThreadStreamingAction, 
  isDebugEnabled: boolean = false
): MultiThreadStreamingState => {
  switch (action.type) {
    // MULTI-THREAD: Process all events and route to correct thread buffers
    case 'REALTIME_MESSAGES_RECEIVED': {
      console.log(`🔍 [REDUCER] REALTIME_MESSAGES_RECEIVED action received with ${action.messages.length} messages`);
      
      debugLog(isDebugEnabled, `🔍 [SUBSCRIPTION] Received ${action.messages.length} total messages, lastProcessed: ${state.lastProcessedIndex}`);
      
      if (action.messages.length <= state.lastProcessedIndex) {
        console.log(`🚫 [REDUCER] No new messages to process (${action.messages.length} <= ${state.lastProcessedIndex}), returning early`);
        debugLog(isDebugEnabled, `[SUBSCRIPTION] No new messages to process (${action.messages.length} <= ${state.lastProcessedIndex})`);
        return state;
      }

      const newMessages = action.messages.slice(state.lastProcessedIndex + 1);
      const newEvents: NetworkEvent[] = newMessages
        .filter(message => message?.data?.event && message.data.sequenceNumber !== undefined)
        .map(message => message.data as NetworkEvent);

      // 🐛 DEBUG: Let's see what events are coming through
      if (newEvents.length > 0) {
        console.log(`🔍 [STREAM-EVENTS-DEBUG] Received ${newEvents.length} new events:`, 
          newEvents.map(e => ({
            event: e.event,
            seq: e.sequenceNumber,
            messageId: (e.data as any)?.messageId,
            partId: (e.data as any)?.partId,
            threadId: (e.data as any)?.threadId,
            delta: e.event === 'text.delta' ? (e.data as any)?.delta : undefined
          }))
        );
      }

      if (newEvents.length === 0) {
        debugLog(isDebugEnabled, `[SUBSCRIPTION] No valid events in new messages, updating lastProcessedIndex to ${action.messages.length - 1}`);
        return {
          ...state,
          lastProcessedIndex: action.messages.length - 1
        };
      }

      debugLog(isDebugEnabled, "[MultiThreadReducer] Processing events for all threads:", {
        totalEvents: action.messages.length,
        newEventCount: newEvents.length,
        lastProcessedIndex: state.lastProcessedIndex,
        eventDetails: newEvents.map(e => ({
          seq: e.sequenceNumber,
          type: e.event,
          threadId: e.data && 'threadId' in e.data ? e.data.threadId : 'unknown'
        })),
        eventsPerThread: newEvents.reduce((acc, event) => {
          const threadId = event.data && 'threadId' in event.data ? event.data.threadId : null;
          if (threadId && typeof threadId === 'string') {
            acc[threadId] = (acc[threadId] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>),
      });

      // Route events to correct thread buffers
      let updatedState = { ...state, lastProcessedIndex: action.messages.length - 1 };
      
      // Group events by thread
      const eventsByThread: Record<string, NetworkEvent[]> = {};
      console.log(`🔍 [REDUCER] Processing ${newEvents.length} new events:`, 
        newEvents.map(e => ({
          event: e.event,
          hasData: !!e.data,
          threadId: (e.data as any)?.threadId,
          messageId: (e.data as any)?.messageId,
          partId: (e.data as any)?.partId,
          delta: e.event === 'text.delta' ? (e.data as any)?.delta : undefined
        }))
      );
      
      newEvents.forEach(event => {
        const threadId = event.data && 'threadId' in event.data ? event.data.threadId : null;
        if (threadId && typeof threadId === 'string') {
          if (!eventsByThread[threadId]) {
            eventsByThread[threadId] = [];
          }
          eventsByThread[threadId].push(event);
        } else {
          debugWarn(isDebugEnabled, `🚨 [EVENT-ROUTING] Event missing threadId:`, event);
        }
      });
      
      console.log(`🔍 [REDUCER] Events grouped by thread:`, {
        threadIds: Object.keys(eventsByThread),
        eventCounts: Object.entries(eventsByThread).map(([tid, events]) => ({
          threadId: tid,
          count: events.length,
          eventTypes: events.map(e => e.event)
        })),
        currentStateThreadId: state.currentThreadId
      });

        // Process events for each thread
  Object.entries(eventsByThread).forEach(([threadId, threadEvents]) => {
          // Only log if processing events for a thread with issues
  if (threadEvents.length > 0) {
    console.log(`🎯 [EVENT-ROUTING] Processing ${threadEvents.length} events for thread ${threadId} (${threadId === state.currentThreadId ? 'current' : 'background'})`);
    
    // 🐛 DEBUG: Log events being processed for the current thread
    if (threadId === state.currentThreadId) {
      console.log(`🔍 [CURRENT-THREAD-DEBUG] Processing events for current thread ${threadId}:`,
        threadEvents.map(e => ({
          event: e.event,
          seq: e.sequenceNumber,
          messageId: (e.data as any)?.messageId,
          partId: (e.data as any)?.partId,
          delta: e.event === 'text.delta' ? (e.data as any)?.delta : undefined,
          type: (e.data as any)?.type
        }))
      );
    }
  }
    
    updatedState = processThreadEvents(updatedState, threadId, threadEvents, isDebugEnabled);
  });

      return updatedState;
    }

    // Update global connection status
    case 'CONNECTION_STATE_CHANGED': {
      return {
        ...state,
        isConnected: action.state === InngestSubscriptionState.Active
      };
    }

    // Switch the currently displayed thread
    case 'SET_CURRENT_THREAD': {
      const ensuredState = ensureThread(state, action.threadId);
      const targetThread = ensuredState.threads[action.threadId];
      
      // Only log thread switches with message counts for debugging
      console.log(`🔄 [THREAD-SWITCH] ${state.currentThreadId} → ${action.threadId} (${state.threads[state.currentThreadId]?.messages.length || 0} → ${targetThread?.messages.length || 0} messages)`);
      
      return {
        ...ensuredState,
        currentThreadId: action.threadId,
        // Mark the thread as viewed when switching to it
        threads: {
          ...ensuredState.threads,
          [action.threadId]: {
            ...ensuredState.threads[action.threadId],
            hasNewMessages: false,
          },
        },
      };
    }

    // Add user message to specific thread
    case 'MESSAGE_SENT': {
      const existingMessages = state.threads[action.threadId]?.messages || [];
      const now = new Date();
      const userMessage: ConversationMessage = {
        id: action.messageId, // Use the canonical, client-generated ID
        role: "user",
        parts: [{ 
          type: "text", 
          id: `text-${action.messageId}`, 
          content: action.message, 
          status: "complete" 
        }],
        timestamp: now,
        status: 'sending', // Initial status for optimistic message
      };
      
      // Simple ID-based duplicate checking only
      // Note: ID collisions are extremely unlikely with timestamp + random suffix + threadId
      const isDuplicate = existingMessages.some(msg => msg.id === userMessage.id);
      
      if (isDuplicate) {
        debugWarn(isDebugEnabled, `🚨 [MESSAGE-SENT] Preventing duplicate user message:`, {
          messageId: userMessage.id,
          threadId: action.threadId,
        });
        return state; // Don't add duplicate
      }
      
      // Only log if this is the first message or there are issues
      if (existingMessages.length === 0) {
        debugLog(isDebugEnabled, `📝 [MESSAGE-SENT] Starting new conversation in thread ${action.threadId}`);
      }
      
      return updateThread(state, action.threadId, {
        messages: [...existingMessages, userMessage],
        agentStatus: "thinking",
        error: undefined,
      });
    }

    // Mark a message as successfully sent
    case 'MESSAGE_SEND_SUCCESS': {
      return updateThread(state, action.threadId, {
        messages: state.threads[action.threadId].messages.map(msg =>
          msg.id === action.messageId ? { ...msg, status: 'sent' } : msg
        ),
      });
    }

    // Mark a message as failed to send and add error info
    case 'MESSAGE_SEND_FAILED': {
      return updateThread(state, action.threadId, {
        messages: state.threads[action.threadId].messages.map(msg =>
          msg.id === action.messageId ? { ...msg, status: 'failed' } : msg
        ),
        agentStatus: "error",
        error: {
          message: action.error,
          timestamp: new Date(),
          recoverable: true,
        },
      });
    }

    // Reset thread for new conversation turn
    case 'RESET_FOR_NEW_TURN': {
      return updateThread(state, action.threadId, {
        nextExpectedSequence: null,
        eventBuffer: new Map(),
        // Don't reset lastProcessedSequence - we want to continue from where we left off
      });
    }

    // Set thread-specific error
    case 'THREAD_ERROR': {
      return updateThread(state, action.threadId, {
        agentStatus: "error",
        error: {
          message: action.error,
          timestamp: new Date(),
          recoverable: action.recoverable ?? true,
        },
      });
    }

    // Set connection-level error
    case 'CONNECTION_ERROR': {
      return {
        ...state,
        connectionError: {
          message: action.error,
          timestamp: new Date(),
          recoverable: action.recoverable ?? true,
        },
      };
    }

    // Clear thread error
    case 'CLEAR_THREAD_ERROR': {
      return updateThread(state, action.threadId, {
        error: undefined,
      });
    }

    // Clear connection error
    case 'CLEAR_CONNECTION_ERROR': {
      return {
        ...state,
        connectionError: undefined,
      };
    }

    // Clear all messages from a specific thread
    case 'CLEAR_THREAD_MESSAGES': {
      return updateThread(state, action.threadId, {
        messages: [],
        eventBuffer: new Map(),
        nextExpectedSequence: null,
        lastProcessedSequence: -1, // Reset sequence tracking for fresh thread
        agentStatus: "idle",
        error: undefined,
      });
    }

    // Replace messages in a specific thread (for loading history)
    case 'REPLACE_THREAD_MESSAGES': {
      debugLog(isDebugEnabled, `🔄 [REPLACE-MESSAGES] Directly replacing ${action.messages.length} messages in thread ${action.threadId}`);
      
      // SIMPLIFIED: Direct replacement - Chat.tsx handles smart merging
      return updateThread(state, action.threadId, {
        messages: action.messages,
        agentStatus: "idle",
        error: undefined,
      });
    }

    // Mark thread as viewed
    case 'MARK_THREAD_VIEWED': {
      return updateThread(state, action.threadId, {
        hasNewMessages: false,
      });
    }

    // Create a new thread (only if it doesn't exist - preserves historical messages)
    case 'CREATE_THREAD': {
      // If thread already exists, don't overwrite it (preserves loaded historical messages)
      if (state.threads[action.threadId]) {
        debugLog(isDebugEnabled, `🔍 [CREATE-THREAD] Thread ${action.threadId} already exists, preserving existing state`);
        return state;
      }
      
      debugLog(isDebugEnabled, `🆕 [CREATE-THREAD] Creating new empty thread ${action.threadId}`);
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.threadId]: createEmptyThreadState(),
        },
      };
    }

    // Remove a thread
    case 'REMOVE_THREAD': {
      const { [action.threadId]: removedThread, ...remainingThreads } = state.threads;
      return {
        ...state,
        threads: remainingThreads,
        // If we're removing the current thread, switch to another one
        currentThreadId: state.currentThreadId === action.threadId 
          ? Object.keys(remainingThreads)[0] || '' 
          : state.currentThreadId,
      };
    }

    default:
      return state;
  }
};

/**
 * Process events for a specific thread (similar to old processBufferedEvents)
 */
const processThreadEvents = (
  state: MultiThreadStreamingState,
  threadId: string,
  events: NetworkEvent[],
  isDebugEnabled: boolean
): MultiThreadStreamingState => {
  let currentState = ensureThread(state, threadId);
  let thread = currentState.threads[threadId];
  
  // Check for a sequence reset BEFORE filtering.
  // A new agent run will restart the sequence at 0.
  const runStartedEvent = events.find(e => e.event === 'run.started' && e.sequenceNumber === 0);
  if (runStartedEvent && thread.lastProcessedSequence > 0) {
    debugLog(isDebugEnabled, `🔄 [SEQUENCE-RESET] Detected new agent run for thread ${threadId}. Resetting sequence state.`);
    
    // Reset the sequence tracking for this thread
    currentState = updateThread(currentState, threadId, {
      lastProcessedSequence: -1, // Reset to -1 so seq 0 is processed
      nextExpectedSequence: 0,
      eventBuffer: new Map(),
    });
    
    // Use the updated thread state for the rest of this function
    thread = currentState.threads[threadId];
  }

  // CRITICAL: Filter out events we've already processed to prevent duplicates
  console.log(`🔍 [SEQUENCE-DEBUG] Thread ${threadId} filtering events:`, {
    totalEvents: events.length,
    lastProcessedSequence: thread.lastProcessedSequence,
    eventDetails: events.map(e => ({
      seq: e.sequenceNumber,
      event: e.event,
      alreadyProcessed: e.sequenceNumber <= thread.lastProcessedSequence,
      messageId: (e.data as any)?.messageId,
      partId: (e.data as any)?.partId,
      delta: e.event === 'text.delta' ? (e.data as any)?.delta : undefined
    }))
  });

  const unprocessedEvents = events.filter(event => 
    event.sequenceNumber > thread.lastProcessedSequence
  );
  
  console.log(`🔍 [SEQUENCE-DEBUG] Thread ${threadId} after filtering:`, {
    unprocessedCount: unprocessedEvents.length,
    filteredOut: events.length - unprocessedEvents.length,
    unprocessedEvents: unprocessedEvents.map(e => ({
      seq: e.sequenceNumber,
      event: e.event,
      messageId: (e.data as any)?.messageId,
      delta: e.event === 'text.delta' ? (e.data as any)?.delta : undefined
    }))
  });
  
  if (unprocessedEvents.length === 0) {
    debugLog(isDebugEnabled, `[Thread ${threadId}] No new events to process (all already processed)`);
    return currentState;
  }
  
  debugLog(isDebugEnabled, `[Thread ${threadId}] Processing ${unprocessedEvents.length}/${events.length} new events:`, {
    newEvents: unprocessedEvents.map(e => `${e.event}:${e.sequenceNumber}`),
    isCurrentThread: threadId === state.currentThreadId,
  });
  
  // Add only unprocessed events to thread's buffer
  const newBuffer = new Map(currentState.threads[threadId].eventBuffer);
  unprocessedEvents.forEach(event => {
    // Double-check: only add if not already in buffer
    if (!newBuffer.has(event.sequenceNumber)) {
      newBuffer.set(event.sequenceNumber, event);
      debugLog(isDebugEnabled, `[Thread ${threadId}] Added event seq:${event.sequenceNumber} type:${event.event}`);
    }
  });
  
  // Initialize expected sequence if needed
  const nextExpected = currentState.threads[threadId].nextExpectedSequence ?? 
    Math.min(...unprocessedEvents.map(e => e.sequenceNumber));
  
  // Update buffer and process events
  currentState = updateThread(currentState, threadId, {
    eventBuffer: newBuffer,
    nextExpectedSequence: nextExpected,
  });
  
  // Process buffered events in sequence
  return processThreadBufferedEvents(currentState, threadId, isDebugEnabled);
};

/**
 * Process buffered events for a specific thread in sequence order
 */
const processThreadBufferedEvents = (
  state: MultiThreadStreamingState,
  threadId: string,
  isDebugEnabled: boolean
): MultiThreadStreamingState => {
  const thread = state.threads[threadId];
  if (!thread || thread.nextExpectedSequence === null || thread.eventBuffer.size === 0) {
    return state;
  }
  
  let currentState = state;
  let nextSeq = thread.nextExpectedSequence;
  let processedCount = 0;
  
  // Create a working copy of the thread for processing
  let workingThread = { ...thread, eventBuffer: new Map(thread.eventBuffer) };
  const processedEvents: NetworkEvent[] = [];
  
  // Process events in sequence order
  while (workingThread.eventBuffer.has(nextSeq)) {
    const event = workingThread.eventBuffer.get(nextSeq)!;
    
    debugLog(isDebugEnabled, `[Thread ${threadId}] Processing event:`, event.event, `(seq: ${nextSeq})`);
    
    // Store processed event for content analysis
    processedEvents.push(event);
    
    // Process the event and update thread state (immutably)
    workingThread = processThreadEvent(workingThread, event, isDebugEnabled);
    
    // Remove processed event from buffer
    workingThread.eventBuffer.delete(nextSeq);
    nextSeq++;
    processedCount++;
  }
  
  if (processedCount > 0) {
    debugLog(isDebugEnabled, `[Thread ${threadId}] Processed ${processedCount} events, next expected: ${nextSeq}`);
  }
  
  // Helper function to check if an event represents content-bearing activity
  const isContentBearingEvent = (event: NetworkEvent): boolean => {
    switch (event.event) {
      // Text content deltas
      case 'text.delta':
        return true;
      
      // Tool activity deltas
      case 'tool_call.arguments.delta':
      case 'tool_call.output.delta':
        return true;
      
      // Reasoning deltas
      case 'reasoning.delta':
        return true;
      
      // Part creation for content types
      case 'part.created':
        return (event.data as any).type === 'text' || 
               (event.data as any).type === 'tool-call' || 
               (event.data as any).type === 'tool-output' ||
               (event.data as any).type === 'reasoning';
      
      // Part completion with actual content
      case 'part.completed':
        return ((event.data as any).type === 'text' || 
                (event.data as any).type === 'tool-call' || 
                (event.data as any).type === 'tool-output' ||
                (event.data as any).type === 'reasoning') && 
               Boolean((event.data as any).finalContent);
      
      // Ignore lifecycle/metadata events
      case 'run.started':
      case 'run.completed':
      case 'run.failed':
      case 'stream.ended':
      case 'step.started':
      case 'step.completed':
      case 'step.failed':
      case 'usage.updated':
      case 'metadata.updated':
      default:
        return false;
    }
  };

  // Check if any of the processed events were content-bearing
  const hasContentBearingEvents = processedCount > 0 && 
    threadId !== currentState.currentThreadId &&
    processedEvents.some(isContentBearingEvent);

  // Only mark as having new messages if we processed content-bearing events for a non-current thread
  const shouldMarkAsUnread = hasContentBearingEvents;

  // Update the thread with all processed changes including sequence tracking
  currentState = updateThread(currentState, threadId, {
    ...workingThread,
    nextExpectedSequence: nextSeq,
    lastProcessedSequence: nextSeq - 1, // Track the highest sequence we've fully processed
    hasNewMessages: shouldMarkAsUnread || workingThread.hasNewMessages, // Preserve existing unread state
  });
  
  return currentState;
};

/**
 * Process a single event for a thread (updated version of updateAgentStatus)
 */
const processThreadEvent = (
  thread: ThreadState,
  event: NetworkEvent,
  isDebugEnabled: boolean
): ThreadState => {
  let updatedThread = { ...thread };
  
  // Handle different event types
  switch (event.event) {
    case "run.started":
      if (event.data.scope === 'agent') {
        updatedThread.agentStatus = "thinking";
        updatedThread.currentAgent = typeof event.data.name === 'string' ? event.data.name : undefined;
      }
      break;
      
    case "part.created":
      if (event.data.type === 'text') {
        updatedThread.agentStatus = "responding";
      }
      break;
      
    case "run.completed":
      if (event.data.scope === 'agent') {
        updatedThread.agentStatus = "idle";
      }
      break;
      
    case "run.failed":
      updatedThread.agentStatus = "error";
      const errorMessage = typeof event.data.error === 'string' ? event.data.error : "Agent run failed";
      const recoverable = typeof event.data.recoverable === 'boolean' ? event.data.recoverable : true;
      updatedThread.error = {
        message: errorMessage,
        timestamp: new Date(),
        recoverable,
      };
      break;
  }
  
  // Process the event for message updates
  updatedThread = processEventForMessage(updatedThread, event, isDebugEnabled);
  
  return updatedThread;
};

/**
 * Process an event for message updates (immutable version)
 */
const processEventForMessage = (
  thread: ThreadState,
  event: NetworkEvent,
  isDebugEnabled: boolean
): ThreadState => {
  const beforeCount = thread.messages.length;
  
  // Use the existing processEvent function which is proven to work correctly
  const updatedMessages = processEvent(thread.messages, event, isDebugEnabled);
  
  const afterCount = updatedMessages.length;
  
  if (beforeCount > 0 && afterCount === 0) {
    console.warn(`🚨 [PROCESS-EVENT] WARNING: Messages cleared during ${event.event} processing! Before: ${beforeCount}, After: ${afterCount}`);
  }
  
  debugLog(isDebugEnabled, `🔍 [PROCESS-EVENT] Message count after ${event.event}: ${beforeCount} → ${afterCount}`);
  
  return {
    ...thread,
    messages: updatedMessages,
  };
};

// Legacy wrapper functions for backward compatibility
const streamingReducer = (state: StreamingState, action: StreamingAction, isDebugEnabled: boolean = false): StreamingState => {
  // This is a legacy wrapper - not actually used in the new implementation
  return state;
};

// ----- USE AGENT HOOK -------------------------------------------

// UseAgentOptions interface is now defined in ./types.ts
// This ensures consistency across hooks and prevents type drift

/**
 * The return value of the `useAgent` hook, providing multi-thread state and functions
 * for managing real-time conversations with an AI agent across multiple threads.
 * 
 * @interface UseAgentReturn
 */
export interface UseAgentReturn {
  // === CURRENT THREAD SHORTCUTS (Backward Compatible) ===
  /** The array of messages in the current conversation thread. */
  messages: ConversationMessage[];
  /** The current status of the agent for the active thread. */
  status: AgentStatus;
  /** The name of the currently active agent for the active thread. */
  currentAgent?: string;
  /** The last error that occurred for the active thread, if any. */
  error?: { message: string; timestamp: Date; recoverable: boolean };
  
  // === MULTI-THREAD STATE ===
  /** All active threads indexed by threadId */
  threads: Record<string, {
    messages: ConversationMessage[];
    status: AgentStatus;
    currentAgent?: string;
    hasNewMessages: boolean;
    lastActivity: Date;
    error?: { message: string; timestamp: Date; recoverable: boolean };
  }>;
  /** The currently active/displayed thread ID */
  currentThreadId: string;
  
  // === CONNECTION STATE ===
  /** The connection status to the real-time event stream. */
  isConnected: boolean;
  /** Connection-level error, if any */
  connectionError?: { message: string; timestamp: Date; recoverable: boolean };
  
  // === ACTIONS ===
  /** Send a message to the current thread */
  sendMessage: (message: string, options?: { messageId?: string }) => Promise<void>;
  /** Send a message to a specific thread */
  sendMessageToThread: (threadId: string, message: string, options?: { 
    messageId?: string; 
    state?: Record<string, unknown> | (() => Record<string, unknown>);
  }) => Promise<void>;
  /** Cancel the current agent run */
  cancel: () => Promise<void>;
  /** Regenerate the last response in the current thread */
  regenerate: () => void;
  /** Clear the current error for the active thread */
  clearError: () => void;
  /** Clear connection-level error */
  clearConnectionError: () => void;
  
  // === THREAD MANAGEMENT ===
  /** Switch to a different thread */
  setCurrentThread: (threadId: string) => void;
  /** Get a specific thread's state */
  getThread: (threadId: string) => {
    messages: ConversationMessage[];
    status: AgentStatus;
    currentAgent?: string;
    hasNewMessages: boolean;
    lastActivity: Date;
    error?: { message: string; timestamp: Date; recoverable: boolean };
  } | undefined;
  /** Create a new empty thread */
  createThread: (threadId: string) => void;
  /** Remove a thread completely */
  removeThread: (threadId: string) => void;
  /** Clear all messages from the current thread */
  clearMessages: () => void;
  /** Clear messages from a specific thread */
  clearThreadMessages: (threadId: string) => void;
  /** Replace messages in the current thread (for loading history) */
  replaceMessages: (messages: ConversationMessage[]) => void;
  /** Replace messages in a specific thread */
  replaceThreadMessages: (threadId: string, messages: ConversationMessage[]) => void;
  /** Mark a thread as viewed (clear hasNewMessages flag) */
  markThreadViewed: (threadId: string) => void;
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
export function useAgent({ threadId, channelKey, userId, onError, debug = DEFAULT_DEBUG_MODE, state: getClientState, transport: providedTransport, __disableSubscription = false }: UseAgentOptions): UseAgentReturn {
  const emptyWarnedThreadsRef = useRef<Set<string>>(new Set());

  // Create standardized debug logger
  const logger = useMemo(() => createDebugLogger('useAgent', debug), [debug]);

  // Check if we're inside a provider to enable smart subscription sharing
  const globalUserId = useOptionalGlobalUserId();
  const globalChannelKey = useOptionalGlobalChannelKey();
  const globalResolvedChannelKey = useOptionalGlobalResolvedChannelKey();
  
  // Resolve local configuration with provider inheritance
  const effectiveUserId = userId || globalUserId;
  const effectiveChannelKey = channelKey || globalChannelKey;

  // Channel key resolution logic
  const resolvedChannelKey = useMemo(() => {
    // 1. Explicit channelKey (collaborative/specific scenarios)
    if (effectiveChannelKey) return effectiveChannelKey;

    // 2. Fallback to userId (private chat - current behavior)
    if (effectiveUserId) return effectiveUserId;

    // 3. Anonymous fallback (new capability)
    let anonymousId = '';
    if (typeof window !== 'undefined') {
      anonymousId = sessionStorage.getItem("agentkit-anonymous-id") || '';
      if (!anonymousId) {
        anonymousId = `anon_${uuidv4()}`;
        sessionStorage.setItem("agentkit-anonymous-id", anonymousId);
      }
    } else {
      // Server-side fallback
      anonymousId = `anon_${uuidv4()}`;
    }
    return anonymousId;
  }, [effectiveChannelKey, effectiveUserId]);
  
  // Smart subscription logic: Provider + Escape Hatch pattern
  const smartDisableSubscription = useMemo(() => {
    // Explicit override takes precedence
    if (__disableSubscription) return true;
    
    // No provider = always enable subscription (standalone mode)
    if (!globalResolvedChannelKey) return false;
    
    // Provider exists = disable subscription ONLY if using same channel (share connection)
    // Different channel = enable subscription (escape hatch for separate connection)
    return globalResolvedChannelKey === resolvedChannelKey;
  }, [__disableSubscription, globalResolvedChannelKey, resolvedChannelKey]);

  // Transport resolution with provider inheritance (provider is optional)
  const providerTransport = useOptionalGlobalTransport();
  const transport = useMemo(() => {
    // Priority 1: Hook-level transport override
    if (providedTransport) {
      return providedTransport;
    }
    
    // Priority 2: Inherit from provider (if available)
    if (providerTransport) {
      return providerTransport;
    }
    
    // Priority 3: Default transport (always works)
    return createDefaultAgentTransport();
  }, [providedTransport, providerTransport]);

  // MULTI-THREAD STATE: Initialize with the provided threadId as the current thread
  const [state, dispatch] = useReducer(
    (state: MultiThreadStreamingState, action: MultiThreadStreamingAction) => 
      multiThreadStreamingReducer(state, action, debug), 
    createInitialMultiThreadState(threadId)
  );

  // Track the last processed threadId to prevent re-processing the same ID
  const lastProcessedThreadId = useRef<string>(threadId);
  
  // Ref to always access latest state in callbacks (prevents closure issues)
  const stateRef = useRef(state);
  stateRef.current = state;

  // UNIFIED STREAMING: Subscribe to user channel (stable connection)
  // This provides a single, stable real-time connection for all user's threads

  const { data: realtimeData, error: realtimeError, state: connectionState } = useInngestSubscription({
    // Use resolvedChannelKey as key - flexible subscription based on channel key architecture
    key: resolvedChannelKey,
    enabled: !smartDisableSubscription, // Smart channel-based subscription sharing
    // This function is called to get a token for the real-time subscription.
    // It should be secured in a production environment with proper authentication.
    refreshToken: async (): Promise<any> => {
      const connectionType = smartDisableSubscription ? 'shared (disabled)' : 'separate';
      logger.log(`🔄 Creating ${connectionType} channel subscription for channelKey:`, resolvedChannelKey);
      try {
        const token = await transport.getRealtimeToken({ 
          userId: effectiveUserId || undefined, 
          threadId, 
          channelKey: resolvedChannelKey 
        });
        logger.log(`✅ ${connectionType} channel subscription token created for channelKey:`, resolvedChannelKey);
        return token;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to get subscription token";
        logger.error("❌ Failed to get subscription token:", errorMessage);
        throw new Error(errorMessage);
      }
    },
  });

  // Effect to process new real-time events when they arrive.
  // MULTI-THREAD: Process ALL events and route to correct thread buffers
  useEffect(() => {
    if (realtimeData) {
      logger.log("Processing all events for multi-thread routing:", {
        totalEvents: realtimeData.length,
        currentThreadId: state.currentThreadId,
        activeThreads: Object.keys(state.threads),
      });

      // Process ALL events - no filtering! Events are routed in the reducer
      dispatch({
        type: 'REALTIME_MESSAGES_RECEIVED',
        messages: realtimeData
      });
    }
  }, [realtimeData, logger]); // Updated dependency

  // Effect to update the connection status.
  // This provides UI feedback about the real-time connection state.
  useEffect(() => {
    dispatch({
      type: 'CONNECTION_STATE_CHANGED',
      state: connectionState
    });
    logger.log("Connection state changed:", { state: connectionState, isActive: connectionState === InngestSubscriptionState.Active });
  }, [connectionState, logger]);

  // Effect to handle errors from the real-time subscription.
  // These are connection-level errors, not thread-specific errors.
  useEffect(() => {
    if (realtimeError) {
      logger.error("Realtime subscription error:", realtimeError);
      dispatch({
        type: 'CONNECTION_ERROR',
        error: realtimeError.message || "Realtime connection error",
        recoverable: true
      });
      onError?.(realtimeError);
    }
  }, [realtimeError, onError, logger]);

  // Effect to handle threadId prop changes - switch to the new thread
  // Use ref to track processed threadIds and avoid circular dependencies
  useEffect(() => {
    if (threadId && threadId !== lastProcessedThreadId.current) {
      logger.log("ThreadId prop changed, switching to:", threadId);
      lastProcessedThreadId.current = threadId; // Update ref to prevent re-processing
      dispatch({ type: 'SET_CURRENT_THREAD', threadId });
    }
  }, [threadId, logger]); // Safe: no circular dependencies

  /**
   * Helper function to send a message to a specific thread
   */
  const sendMessageToThread = useCallback(async (targetThreadId: string, message: string, options?: { 
    messageId?: string; 
    state?: Record<string, unknown> | (() => Record<string, unknown>);
  }) => {
    if (!message.trim()) return;

    // CRITICAL: Always get the latest state to avoid closure issues
    const currentState = stateRef.current;
    
    // Ensure the thread exists (but won't overwrite if it already exists)
    dispatch({ type: 'CREATE_THREAD', threadId: targetThreadId });
    
    // Get the target thread's current message history from latest state
    const targetThread = currentState.threads[targetThreadId];
    const currentMessages = targetThread?.messages || [];
    
    logger.log(`🔍 [SEND-MSG] Thread ${targetThreadId} before sending:`, {
      existingMessages: currentMessages.length,
      messagePreview: currentMessages.map(m => ({ role: m.role, partsCount: m.parts.length })),
      isHistoricalThread: currentMessages.length > 0,
      threadExists: !!targetThread,
      currentThreadId: currentState.currentThreadId,
      stateThreadsCount: Object.keys(currentState.threads).length,
    });
    
    const simpleHistory = formatMessagesToAgentKitHistory(currentMessages);
    const messageId = options?.messageId || uuidv4();

    // Optimistically update the target thread
    dispatch({ type: 'MESSAGE_SENT', threadId: targetThreadId, message, messageId });
    dispatch({ type: 'RESET_FOR_NEW_TURN', threadId: targetThreadId });

    // Send to backend
    try {
      logger.log("Sending message to thread:", {
        targetThreadId,
        messageId,
        message: message.substring(0, 50) + "...",
        historyLength: simpleHistory.length,
      });

      // Determine which state to use (priority: options.state > configured getClientState > fallback)
      let messageState: Record<string, unknown>;
      if (options?.state) {
        // Use state passed directly to this call
        messageState = typeof options.state === 'function' ? options.state() : options.state;
      } else if (getClientState) {
        // Use configured state function
        messageState = getClientState();
      } else {
        // Fallback state for backwards compatibility / testing
        messageState = { timestamp: Date.now() };
      }

      // Construct a UserMessage object with configurable client state
      const userMessage = {
        id: messageId,
        content: message,
        role: "user" as const,
        state: messageState,
        clientTimestamp: new Date(),
      };

      const response = await transport.sendMessage({
        userMessage,
        threadId: targetThreadId,
        history: simpleHistory,
        userId: effectiveUserId || undefined, // Use effective userId with provider inheritance
        channelKey: resolvedChannelKey, // Pass channelKey for flexible subscriptions
      });

      // Mark the message as successfully sent
      dispatch({ type: 'MESSAGE_SEND_SUCCESS', threadId: targetThreadId, messageId });

    } catch (error) {
      logger.error("Error sending message:", error);
      
      // Enhanced error message extraction for AgentError objects
      let errorMessage: string;
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        // It's an AgentError or Error object with a message property
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }
      
      dispatch({
        type: 'MESSAGE_SEND_FAILED',
        threadId: targetThreadId,
        messageId,
        error: errorMessage,
      });
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [logger, onError, getClientState, transport, effectiveUserId]); // Include transport and effectiveUserId dependencies

  /**
   * Send a message to the currently active thread
   */
  const sendMessage = useCallback(async (message: string, options?: { messageId?: string }) => {
    const currentThreadId = state.currentThreadId;
    console.log(`📤 [SEND-MESSAGE] Sending to current thread: ${currentThreadId}`);
    await sendMessageToThread(currentThreadId, message, options);
  }, [sendMessageToThread, state.currentThreadId]);

  // === THREAD MANAGEMENT FUNCTIONS ===
  
  /**
   * Switch to a different thread (updates currentThreadId and marks as viewed)
   */
  const setCurrentThread = useCallback((targetThreadId: string) => {
    // 🔍 DIAGNOSTIC: Verify thread switching without duplication
    console.log('🔍 [DIAG] Thread switch requested:', {
      from: stateRef.current.currentThreadId,
      to: targetThreadId,
      threadsInMemory: Object.keys(stateRef.current.threads).length,
      timestamp: new Date().toISOString()
    });
    dispatch({ type: 'SET_CURRENT_THREAD', threadId: targetThreadId });
  }, []);

  /**
   * Get a specific thread's state
   */
  const getThread = useCallback((targetThreadId: string) => {
    const currentState = stateRef.current;
    const thread = currentState.threads[targetThreadId];
    if (!thread) return undefined;
    
    // Return thread data directly - duplicates should be prevented at source
    
    return {
      messages: thread.messages,
      status: thread.agentStatus,
      currentAgent: thread.currentAgent,
      hasNewMessages: thread.hasNewMessages,
      lastActivity: thread.lastActivity,
      error: thread.error,
    };
  }, []);

  /**
   * Create a new empty thread
   */
  const createThread = useCallback((targetThreadId: string) => {
    dispatch({ type: 'CREATE_THREAD', threadId: targetThreadId });
  }, []);

  /**
   * Remove a thread completely
   */
  const removeThread = useCallback((targetThreadId: string) => {
    dispatch({ type: 'REMOVE_THREAD', threadId: targetThreadId });
  }, []);

  /**
   * Clear all messages from the current thread
   */
  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_THREAD_MESSAGES', threadId: stateRef.current.currentThreadId });
  }, []);

  /**
   * Clear messages from a specific thread
   */
  const clearThreadMessages = useCallback((targetThreadId: string) => {
    dispatch({ type: 'CLEAR_THREAD_MESSAGES', threadId: targetThreadId });
  }, []);

  /**
   * Replace messages in the current thread (for loading history)
   */
  const replaceMessages = useCallback((messages: ConversationMessage[]) => {
    dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId: stateRef.current.currentThreadId, messages });
  }, []);

  /**
   * Replace messages in a specific thread
   */
  const replaceThreadMessages = useCallback((targetThreadId: string, messages: ConversationMessage[]) => {
      // Check for duplicate message IDs
      const messageIds = messages.map(m => m.id);
      const uniqueIds = new Set(messageIds);
      if (messageIds.length !== uniqueIds.size) {
        debugWarn(debug, `[useAgent] Duplicate message IDs detected in replaceThreadMessages:`, {
          targetThreadId,
          totalMessages: messageIds.length,
          uniqueIds: uniqueIds.size,
          duplicateIds: messageIds.filter((id, index) => messageIds.indexOf(id) !== index),
        });
      }
      
      // 🔍 DIAGNOSTIC: Verify thread message replacement
      console.log('🔍 [DIAG] Replacing thread messages:', {
        targetThreadId,
        messageCount: messages.length,
        hasValidIds: messages.every(m => m.id && typeof m.id === 'string'),
        messageIds: messages.map(m => ({ id: m.id, role: m.role })),
        timestamp: new Date().toISOString()
      });
      
    dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId: targetThreadId, messages });
  }, [debug]);

  /**
   * Mark a thread as viewed (clear hasNewMessages flag)
   */
  const markThreadViewed = useCallback((targetThreadId: string) => {
    dispatch({ type: 'MARK_THREAD_VIEWED', threadId: targetThreadId });
  }, []);

  /**
   * Clear the current thread's error state
   */
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_THREAD_ERROR', threadId: stateRef.current.currentThreadId });
  }, []);

  /**
   * Clear connection-level error
   */
  const clearConnectionError = useCallback(() => {
    dispatch({ type: 'CLEAR_CONNECTION_ERROR' });
  }, []);

  /**
   * Cancel the current agent run
   */
  const cancel = useCallback(async () => {
    const currentThreadId = stateRef.current.currentThreadId;
    
    if (!transport.cancelMessage) {
      logger.warn("Cancel not supported by current transport");
      return;
    }

    try {
      await transport.cancelMessage({ threadId: currentThreadId });
      logger.log("Cancellation request sent for thread:", currentThreadId);
      
      // Update local state to reflect cancellation
      dispatch({
        type: "THREAD_ERROR",
        threadId: currentThreadId,
        error: "Cancelled by user",
        recoverable: true,
      });
    } catch (error) {
      logger.error("Failed to cancel:", error);
      
      // Still update state to show that cancellation was attempted
      dispatch({
        type: "THREAD_ERROR",
        threadId: currentThreadId,
        error: "Failed to cancel agent run",
        recoverable: true,
      });
    }
  }, [transport, logger]);

  /**
   * Regenerate the last response in the current thread
   */
  const regenerate = useCallback(() => {
    const currentState = stateRef.current;
    const currentThread = currentState.threads[currentState.currentThreadId];
    if (!currentThread) return;
    
    // Find the most recent user message in the current thread
    const lastUserMessage = [...currentThread.messages].reverse().find(msg => msg.role === 'user');
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
  }, [sendMessage]);

  // === CURRENT THREAD ACCESSORS (Backward Compatible) ===
  // Use latest state to prevent stale closure issues
  const currentThread = stateRef.current.threads[stateRef.current.currentThreadId];
  const rawCurrentMessages = currentThread?.messages || [];
  
  // Use messages directly from state - duplicates should be prevented at source
  const currentMessages = rawCurrentMessages;

  // CRITICAL DEBUG: Track message imbalances and duplicates
  const userMessages = currentMessages.filter(m => m.role === 'user');
  const assistantMessages = currentMessages.filter(m => m.role === 'assistant');
  
  // Check for duplicate user messages (common bug)
  if (debug && userMessages.length > 1) {
    const userContents = userMessages.map(m => 
      m.parts[0]?.type === 'text' ? (m.parts[0] as any).content : ''
    );
    const uniqueContents = new Set(userContents);
    
    if (userContents.length !== uniqueContents.size) {
      debugWarn(debug, `🚨 [DUPLICATE-USER-MESSAGES] Thread ${stateRef.current.currentThreadId} has duplicate user messages!`);
    }
  }
  
  if (debug && userMessages.length === 0 && assistantMessages.length > 0) {
    debugWarn(debug, `🚨 [MISSING-USER-MESSAGES] Thread ${stateRef.current.currentThreadId} has assistant messages but NO user messages!`);
  }
  
  // Debug: Only log critical thread issues
  if (debug && currentMessages.length === 0 && currentThread) {
    const tid = stateRef.current.currentThreadId;
    if (!emptyWarnedThreadsRef.current.has(tid)) {
      emptyWarnedThreadsRef.current.add(tid);
      debugWarn(debug, `🚨 [CURRENT-THREAD] Empty thread detected:`, { threadId: tid });
    }
  }
  
  return {
    // === BACKWARD COMPATIBLE API (Current Thread Shortcuts) ===
    messages: currentMessages,
    status: currentThread?.agentStatus || "idle", 
    currentAgent: currentThread?.currentAgent,
    error: currentThread?.error,
    
    // === MULTI-THREAD STATE ===
    threads: Object.fromEntries(
      Object.entries(stateRef.current.threads).map(([id, thread]) => [
        id,
        {
          messages: thread.messages,
          status: thread.agentStatus,
          currentAgent: thread.currentAgent,
          hasNewMessages: thread.hasNewMessages,
          lastActivity: thread.lastActivity,
          error: thread.error,
        },
      ])
    ),
    currentThreadId: stateRef.current.currentThreadId,
    
    // === CONNECTION STATE ===
    isConnected: stateRef.current.isConnected,
    connectionError: stateRef.current.connectionError,
    
    // === ACTIONS ===
    sendMessage,
    sendMessageToThread,
    cancel,
    regenerate,
    clearError,
    clearConnectionError,
    
    // === THREAD MANAGEMENT ===
    setCurrentThread,
    getThread,
    createThread,
    removeThread,
    clearMessages,
    clearThreadMessages,
    replaceMessages,
    replaceThreadMessages,
    markThreadViewed,
  };
}
