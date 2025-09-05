"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useThreads } from './use-threads.js';
import { useAgent } from './use-agent.js';
import { v4 as uuidv4 } from 'uuid';
import { 
  useOptionalGlobalAgent, 
  useOptionalGlobalTransport, 
  useOptionalGlobalUserId, 
  useOptionalGlobalChannelKey,
  useOptionalGlobalResolvedChannelKey
} from '../components/AgentProvider.js';
import { type Thread, type ConversationMessage, type AgentStatus, createDebugLogger } from '../types/index.js';

/**
 * Return value interface for the useChat hook.
 * 
 * This interface combines agent streaming capabilities with thread management,
 * providing a unified API for building complete chat applications. It handles
 * the coordination between real-time agent interactions and persistent conversation
 * threads automatically.
 * 
 * @interface UseChatReturn
 */
export interface UseChatReturn {
  // === REAL-TIME AGENT STATE ===
  /** Current thread's messages with real-time streaming updates */
  messages: ConversationMessage[];
  /** Agent execution status for the current thread (idle, thinking, responding, error) */
  status: AgentStatus;
  /** WebSocket connection status to AgentKit */
  isConnected: boolean;
  /** Name of the currently active agent (if available) */
  currentAgent?: string;
  /** Current error state with recovery information */
  error?: { message: string; timestamp: Date; recoverable: boolean };
  /** Clear the current error state */
  clearError: () => void;
  
  // === THREAD MANAGEMENT STATE ===
  /** Array of all conversation threads with metadata */
  threads: Thread[];
  /** Loading state for threads list */
  threadsLoading: boolean;
  /** Whether more threads are available for pagination */
  threadsHasMore: boolean;
  /** Error state for threads operations */
  threadsError: string | null;
  /** ID of the currently active thread */
  currentThreadId: string | null;
  
  // === LOADING STATES ===
  /** Loading state when switching to a URL-provided thread */
  isLoadingInitialThread: boolean;
  
  // === UNIFIED ACTIONS ===
  /** Send a message to the current thread (handles coordination automatically) */
  sendMessage: (message: string, options?: { messageId?: string }) => Promise<void>;
  /** Send a message to a specific thread (advanced use cases like branching) */
  sendMessageToThread: (threadId: string, message: string, options?: { 
    messageId?: string; 
    state?: Record<string, unknown> | (() => Record<string, unknown>);
  }) => Promise<void>;
  /** Cancel the current agent run */
  cancel: () => Promise<void>;
  /** Approve a tool call in Human-in-the-Loop workflows */
  approveToolCall: (toolCallId: string, reason?: string) => Promise<void>;
  /** Deny a tool call in Human-in-the-Loop workflows */
  denyToolCall: (toolCallId: string, reason?: string) => Promise<void>;
  
  // === THREAD NAVIGATION ===
  /** Switch to a thread with automatic history loading */
  switchToThread: (threadId: string) => Promise<void>;
  /** Immediate thread switch without history loading (for ephemeral scenarios) */
  setCurrentThreadId: (threadId: string) => void;
  
  // === ADVANCED THREAD OPERATIONS ===
  /** Load thread history without switching to it */
  loadThreadHistory: (threadId: string) => Promise<ConversationMessage[]>;
  /** Clear all messages from a specific thread */
  clearThreadMessages: (threadId: string) => void;
  /** Replace all messages in a specific thread */
  replaceThreadMessages: (threadId: string, messages: ConversationMessage[]) => void;
  
  // === THREAD CRUD OPERATIONS ===
  /** Delete a thread and all its messages */
  deleteThread: (threadId: string) => Promise<void>;
  /** Load more threads for pagination */
  loadMoreThreads: () => Promise<void>;
  /** Refresh the threads list */
  refreshThreads: () => Promise<void>;
  
  // === THREAD CREATION ===
  /** Create a new thread and return its ID (supports URL and function patterns) */
  createNewThread: () => string;
  
  // === MESSAGE EDITING SUPPORT ===
  /** Rehydrate client state for editing messages from previous contexts */
  rehydrateMessageState: (messageId: string) => void;
}

export interface UseChatConfig {
  userId?: string; // Optional: inherits from AgentProvider if not provided
  channelKey?: string; // Optional: inherits from AgentProvider if not provided
  initialThreadId?: string;
  debug?: boolean;
  
  // NEW: Configurable thread validation
  enableThreadValidation?: boolean; // Default: true for backward compatibility
  onThreadNotFound?: (threadId: string) => void; // Custom handler for missing threads
  
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
   * Optional callback to restore UI state when editing messages from previous contexts.
   * This enables rehydrating the UI to match the state from when a message was originally sent.
   * 
   * @param messageState - The client state that was captured when the message was sent
   * @param messageId - The ID of the message being edited
   * 
   * @example
   * ```typescript
   * onStateRehydrate: (messageState, messageId) => {
   *   // Restore SQL query in editor
   *   if (messageState.sqlQuery) {
   *     setSqlQuery(messageState.sqlQuery);
   *   }
   *   
   *   // Restore tab context
   *   if (messageState.tabTitle) {
   *     setActiveTab(messageState.tabTitle);
   *   }
   * }
   * ```
   */
  onStateRehydrate?: (messageState: Record<string, unknown>, messageId: string) => void;
  
  // Custom fetch functions for flexibility
  fetchThreads?: (userId: string, pagination: { limit: number; offset: number }) => Promise<{
    threads: Thread[];
    hasMore: boolean;
    total: number;
  }>;
  fetchHistory?: (threadId: string) => Promise<any[]>;
  createThread?: (userId: string) => Promise<{ threadId: string; title: string }>;
  deleteThread?: (threadId: string) => Promise<void>;
  renameThread?: (threadId: string, title: string) => Promise<void>;
}

/**
 * Convert raw database messages to UI ConversationMessage format.
 * 
 * This utility function transforms the database storage format (used by AgentKit's
 * history adapter) into the rich ConversationMessage format expected by the UI.
 * It handles both user messages and agent responses, extracting content and
 * preserving client state for message editing workflows.
 * 
 * @param dbMessages - Raw database messages from AgentKit history
 * @returns Array of ConversationMessage objects for UI consumption
 * 
 * @example
 * ```typescript
 * const dbMessages = [
 *   { type: 'user', message_id: 'msg-1', content: 'Hello', clientState: { tab: 'chat' } },
 *   { type: 'agent', message_id: 'msg-2', agentName: 'assistant', data: { output: [...] } }
 * ];
 * const uiMessages = convertDatabaseToUIFormat(dbMessages);
 * // Returns: [{ id: 'msg-1', role: 'user', parts: [...] }, { id: 'msg-2', role: 'assistant', parts: [...] }]
 * ```
 */
const convertDatabaseToUIFormat = (dbMessages: any[]): ConversationMessage[] => {
  const result = dbMessages.map(msg => {
    if (msg.type === 'user') {
      return {
        id: msg.message_id, // Use canonical ID
        role: 'user' as const,
        parts: [{
          type: 'text' as const,
          id: `text-${msg.message_id}`,
          content: msg.content || 'No content',
          status: 'complete' as const
        }],
        timestamp: new Date(msg.createdAt),
        status: 'sent' as const, // Historical messages are always 'sent'
        clientState: msg.clientState, // NEW: Restore original client state
      };
    } else {
      // For agent messages, extract content from the data.output array
      let content = 'No content';
      if (msg.data?.output && Array.isArray(msg.data.output)) {
        const textMessage = msg.data.output.find((output: any) => 
          output.type === 'text' && output.role === 'assistant'
        );
        if (textMessage?.content) {
          content = textMessage.content;
        }
      }
      
      return {
        id: msg.message_id, // Use canonical ID
        role: 'assistant' as const,
        parts: [{
          type: 'text' as const,
          id: `text-${msg.message_id}`,
          content,
          status: 'complete' as const
        }],
        agentId: msg.agentName,
        timestamp: new Date(msg.createdAt),
        status: 'sent' as const, // Historical messages are always 'sent'
      };
    }
  });
  // Check for duplicate message IDs from database
  const ids = result.map(m => m.id);
  const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  if (dupes.length > 0) {
    // Note: This warning should remain as it indicates a serious database issue
    console.warn(`[useChat] Duplicate message IDs from database:`, { duplicateIds: dupes });
  }
  return result;
};

/**
 * A unified React hook that combines real-time agent interactions with thread management.
 * 
 * This hook provides a complete solution for building chat applications with AgentKit.
 * It automatically coordinates between useAgent (for real-time streaming) and useThreads
 * (for persistence and thread management), handling all the complex synchronization
 * between real-time state and persistent storage.
 * 
 * ## Key Features
 * 
 * - **Unified API**: Single hook for complete chat functionality
 * - **Automatic Coordination**: Syncs agent state with thread state seamlessly  
 * - **Provider Integration**: Inherits configuration from AgentProvider when available
 * - **Progressive Enhancement**: Works with URLs, standalone, or embedded scenarios
 * - **Client State Capture**: Records UI context for message editing and regeneration
 * - **Thread Validation**: Handles missing threads gracefully with customizable fallbacks
 * 
 * ## Usage Patterns
 * 
 * 1. **URL-driven**: `useChat({ initialThreadId: params.threadId })` for `/chat/[id]` routes
 * 2. **Standalone**: `useChat()` for homepage or new conversations  
 * 3. **Embedded**: `useChat({ enableThreadValidation: false })` for custom persistence
 * 
 * @param config - Configuration options for the chat hook
 * @returns Object containing unified chat state and actions
 * 
 * @example
 * ```typescript
 * // URL-driven chat page (e.g., /chat/[threadId])
 * function ChatPage({ params }: { params: { threadId: string } }) {
 *   const {
 *     messages,
 *     sendMessage,
 *     threads,
 *     switchToThread,
 *     deleteThread,
 *     status,
 *     isConnected
 *   } = useChat({
 *     initialThreadId: params.threadId,
 *     debug: true,
 *     state: () => ({
 *       currentPage: 'chat',
 *       userAgent: navigator.userAgent,
 *       timestamp: Date.now()
 *     }),
 *     onStateRehydrate: (clientState, messageId) => {
 *       // Restore UI state when editing previous messages
 *       if (clientState.selectedTab) {
 *         setActiveTab(clientState.selectedTab);
 *       }
 *     }
 *   });
 * 
 *   return (
 *     <div>
 *       <Sidebar 
 *         threads={threads} 
 *         onThreadSelect={switchToThread}
 *         onDeleteThread={deleteThread}
 *       />
 *       <Chat 
 *         messages={messages}
 *         onSendMessage={sendMessage}
 *         status={status}
 *         isConnected={isConnected}
 *       />
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Homepage with new conversation support
 * function HomePage() {
 *   const {
 *     messages,
 *     sendMessage,
 *     createNewThread,
 *     currentThreadId,
 *     status
 *   } = useChat();
 * 
 *   const handleSendMessage = async (text: string) => {
 *     if (messages.length === 0) {
 *       // First message - will trigger navigation to new thread URL
 *       const newThreadId = createNewThread();
 *       await sendMessage(text);
 *       router.push(`/chat/${newThreadId}`);
 *     } else {
 *       await sendMessage(text);
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       {messages.length === 0 ? (
 *         <EmptyState onSendMessage={handleSendMessage} />
 *       ) : (
 *         <Chat messages={messages} status={status} />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export const useChat = (config?: UseChatConfig): UseChatReturn => {
  // === PROVIDER INHERITANCE LOGIC ===
  // Gracefully inherit from AgentProvider when available, fall back to local config
  const globalUserId = useOptionalGlobalUserId();
  const globalChannelKey = useOptionalGlobalChannelKey();
  const globalResolvedChannelKey = useOptionalGlobalResolvedChannelKey();
  
  // Resolve configuration with provider inheritance
  // Local config takes precedence over provider values
  const resolvedUserId = config?.userId || globalUserId || undefined;
  const resolvedChannelKey = config?.channelKey || globalChannelKey || undefined;
  
  // Calculate what our local channel key would be (using same logic as useAgent)
  const localResolvedChannelKey = useMemo(() => {
    // Same resolution logic as useAgent
    if (resolvedChannelKey) return resolvedChannelKey;
    if (resolvedUserId) return resolvedUserId;
    
    // Anonymous fallback (but this should match provider logic)
    if (typeof window !== 'undefined') {
      let anonymousId = sessionStorage.getItem("agentkit-anonymous-id");
      if (!anonymousId) {
        anonymousId = `anon_${uuidv4()}`;
        sessionStorage.setItem("agentkit-anonymous-id", anonymousId);
      }
      return anonymousId;
    }
    return `anon_${uuidv4()}`;
  }, [resolvedChannelKey, resolvedUserId]);
  
  // Validate that we have at least a userId for thread management
  if (!resolvedUserId) {
    throw new Error(
      'useChat requires a userId either via config prop or AgentProvider. ' +
      'Pass userId to useChat() or wrap your component with <AgentProvider userId="...">'
    );
  }

  // Stable thread ID generation - only create once
  const [fallbackThreadId] = useState(() => config?.initialThreadId || uuidv4());
  
  // Create standardized debug logger
  const logger = useMemo(() => createDebugLogger('useChat', config?.debug ?? false), [config?.debug]);
  
  // Instance tracking for telemetry
  const [instanceId] = useState(() => `chat-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`);
  logger.log('useChat.instance', { 
    instanceId, 
    initialThreadId: config?.initialThreadId,
    resolvedUserId,
    resolvedChannelKey,
    inheritedFromProvider: !!globalUserId 
  });
  
  // 1. Thread management hook
  const threads = useThreads({
    userId: resolvedUserId!, // Non-null assertion safe due to validation above
    channelKey: resolvedChannelKey, // Use resolved value
    debug: config?.debug, // Pass debug flag to threads hook
    fetchThreads: config?.fetchThreads,
    fetchHistory: config?.fetchHistory,
    createThread: config?.createThread,
    deleteThread: config?.deleteThread,
    renameThread: config?.renameThread,
  });
  
  // 2. Stable threadId - prevents constant regeneration  
  const currentThreadId = threads.currentThreadId || fallbackThreadId;
  
  // 3. Initialize thread if provided via config (ONLY ONCE, not continuously enforced)
  const [hasInitialized, setHasInitialized] = useState(false);
  useEffect(() => {
    if (config?.initialThreadId && !hasInitialized) {
      threads.setCurrentThreadId(config.initialThreadId);
      setHasInitialized(true); // Prevent re-running this effect
      logger.log('initialized:setInitialThread', {
        initialThreadId: config.initialThreadId,
        willNotRunAgain: true
      });
    }
  }, [config?.initialThreadId, hasInitialized, threads.setCurrentThreadId]);
  
  // 3.5. Internal thread validation (moved from Chat.tsx for better DX)
  // Note: Validation moved to after agent creation to avoid variable hoisting issues
  
  // 4. Smart agent resolution: use provider agent if available, otherwise create local instance
  const globalAgent = useOptionalGlobalAgent();
  const globalTransport = useOptionalGlobalTransport();
  
  // === SMART SUBSCRIPTION LOGIC ===
  // Determines whether to share the provider's WebSocket connection or create a separate one.
  // This enables both shared connections (for performance) and isolated connections (for flexibility).
  const shouldDisableLocalSubscription = useMemo(() => {
    // Case 1: No global agent = always enable local subscription (standalone mode)
    // When not inside AgentProvider, this hook needs its own agent instance
    if (!globalAgent) return false;
    
    // Case 2: Global agent exists = channel-based sharing decision
    // If using SAME channel = disable local subscription (share the provider's connection)
    // If using DIFFERENT channel = enable local subscription (create isolated connection)
    // This allows escape hatch for separate conversations while optimizing shared ones
    return globalResolvedChannelKey === localResolvedChannelKey;
  }, [globalAgent, globalResolvedChannelKey, localResolvedChannelKey]);
  
  // IMPORTANT: Always create local agent but conditionally disable its subscription
  // When there's a global agent with the SAME channel, disable local subscription to share connection
  // When there's a global agent with DIFFERENT channel, enable local subscription for isolation
  const localAgent = useAgent({
    threadId: currentThreadId,
    userId: resolvedUserId!, // Non-null assertion safe due to validation above
    channelKey: resolvedChannelKey, // Use resolved value
    debug: config?.debug,
    state: config?.state,
    __disableSubscription: shouldDisableLocalSubscription, // Smart channel-based sharing
    // Don't pass transport here - useAgent will resolve it using the same priority logic
  });
  
  // Use provider agent if available, otherwise use local agent
  const agent = globalAgent || localAgent;
  const transport = globalTransport || null; // May be null for fallback fetch calls
  
  // 🔍 DIAGNOSTIC: Verify agent instance resolution and channel logic
  logger.log('agent resolution:', {
    hasGlobalAgent: !!globalAgent,
    hasGlobalTransport: !!globalTransport,
    usingProvider: !!globalAgent,
    agentConnected: agent.isConnected,
    currentThread: agent.currentThreadId,
    // NEW: Channel-based subscription sharing logic
    channelSharing: {
      globalChannel: globalResolvedChannelKey,
      localChannel: localResolvedChannelKey,
      sameChannel: globalResolvedChannelKey === localResolvedChannelKey,
      shouldDisableLocal: shouldDisableLocalSubscription,
      connectionStrategy: shouldDisableLocalSubscription ? 'shared' : 'separate',
    },
    timestamp: new Date().toISOString()
  });
  
  // 5. Sync agent to current thread (works for both global and local agents)
  useEffect(() => {
    if (currentThreadId && currentThreadId !== agent.currentThreadId) {
      agent.setCurrentThread(currentThreadId);
    }
  }, [currentThreadId, agent.currentThreadId, agent.setCurrentThread]);
  
  // Thread validation moved to after all variables are declared to avoid hoisting issues
  
  // 6. Sophisticated thread switching with smart deduplication
  const switchToThread = useCallback(async (selectedThreadId: string) => {
    try {
      logger.log('switchToThread:start', { selectedThreadId, prevAgentThread: agent.currentThreadId, prevThreadsThread: threads.currentThreadId });
      
      // Step 1: Switch to the thread immediately in the agent state.
      // This ensures any subsequent actions (like sending a message) are
      // correctly targeted to the new thread.
      agent.setCurrentThread(selectedThreadId);
      threads.setCurrentThreadId(selectedThreadId);
      
      // Step 2: Capture any optimistic messages that might exist in the thread
      // before we overwrite them with historical data.
      const existingThread = agent.getThread(selectedThreadId);
      const optimisticMessages = existingThread?.messages || [];
      
      // Step 3: Load historical messages from database using transport or fallback
      try {
        let dbMessages: any[];
        if (transport) {
          // Use transport method
          dbMessages = await transport.fetchHistory({ threadId: selectedThreadId });
        } else {
          // Fallback to direct fetch when no transport available
          const response = await fetch(`/api/threads/${selectedThreadId}`);
          if (!response.ok) {
            throw new Error('Failed to fetch thread history');
          }
          const data = await response.json();
          dbMessages = data.messages;
        }
        const historicalMessages = convertDatabaseToUIFormat(dbMessages);

        // --- CANONICAL ID RECONCILIATION LOGIC ---
        // Create a set of historical message IDs for efficient lookup.
        const historicalIds = new Set(historicalMessages.map(m => m.id));

        // Filter the optimistic messages to only include those that are not
        // already present in the historical record. This preserves any messages
        // sent by the user that haven't been saved to the DB yet, and handles
        // cases where navigation occurs while messages are in-flight.
        const recentOptimisticMessages = optimisticMessages.filter(
          msg => !historicalIds.has(msg.id)
        );
        
        // Combine the server's history with the new optimistic messages.
        const finalMessages = [...historicalMessages, ...recentOptimisticMessages];

        // Load the intelligently reconciled messages into the agent state.
        agent.replaceThreadMessages(selectedThreadId, finalMessages);
        logger.log('switchToThread:success', { selectedThreadId, historicalCount: historicalMessages.length, optimisticKept: recentOptimisticMessages.length });
      } catch (historyError) {
        logger.warn('Failed to load thread history, continuing with optimistic messages:', historyError);
        logger.log('switchToThread:historyError', { selectedThreadId, error: historyError instanceof Error ? historyError.message : String(historyError) });
        // Continue with just optimistic messages if history load fails
      }
    } catch (err) {
      logger.error('Error switching thread:', err);
      logger.log('switchToThread:error', { selectedThreadId, error: err instanceof Error ? err.message : String(err) });
    }
  }, [agent, agent.setCurrentThread, agent.getThread, agent.replaceThreadMessages, transport]);

  // Auto-load thread whenever initialThreadId changes (route navigation)
  const [isLoadingInitialThread, setIsLoadingInitialThread] = useState(false);
  const lastLoadedInitialIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    const targetId = config?.initialThreadId;
    if (!targetId) return;
    
    // Avoid redundant loads (including React StrictMode double-invoke)
    if (lastLoadedInitialIdRef.current === targetId) return;
    lastLoadedInitialIdRef.current = targetId;
    
    setIsLoadingInitialThread(true);
    switchToThread(targetId)
      .catch(err => {
        logger.error('Failed to load initial thread:', err);
      })
      .finally(() => {
        setIsLoadingInitialThread(false);
      });
  }, [config?.initialThreadId, switchToThread]);
  
  // 7.5. Configurable thread validation (escape hatch for custom persistence layers)
  useEffect(() => {
    // Only validate if validation is enabled (default: true for backward compatibility)
    const validationEnabled = config?.enableThreadValidation ?? true;
    if (!validationEnabled) return;
    
    // Only validate if we have an initialThreadId (URL-provided) and threads have loaded
    if (config?.initialThreadId && !threads.loading && hasInitialized) {
      const threadExists = threads.threads.some(t => t.id === config.initialThreadId);
      
      if (!threadExists) {
        // Check if this is likely a fresh thread (no messages, not loading history)
        const isLikelyFreshThread = agent.messages.length === 0 && !isLoadingInitialThread;
        
        if (!isLikelyFreshThread) {
          logger.warn(`Thread not found:`, { requested: config.initialThreadId });
          
          // NEW: Use custom handler if provided, otherwise fallback to default behavior
          if (config.onThreadNotFound) {
            config.onThreadNotFound(config.initialThreadId);
          } else {
            // Default behavior: redirect to homepage (backward compatibility)
            // For a production package, users should provide onThreadNotFound handler
            if (typeof window !== 'undefined' && window.location) {
              window.location.href = '/';
            }
          }
        } else {
          logger.log(`Allowing fresh thread:`, { 
            threadId: config.initialThreadId,
            messageCount: agent.messages.length,
            isLoadingInitial: isLoadingInitialThread 
          });
        }
      }
    }
  }, [config?.initialThreadId, config?.enableThreadValidation, config?.onThreadNotFound, threads.loading, threads.threads, hasInitialized, agent.messages.length, isLoadingInitialThread]);
  
  // 8. Enhanced message sending with optimistic updates and client state
  const sendMessage = useCallback(
    async (message: string, options?: { messageId?: string }) => {
      // If this is the first message in a new thread, add to sidebar optimistically
      // Use the stable `currentThreadId` from the hook's scope, not the one from `threads` state
      if (agent.messages.length === 0 && currentThreadId) {
        const title =
          message.length > 50 ? message.substring(0, 47) + "..." : message;
        logger.log(
          "sendMessage:optimisticAdd",
          { threadId: currentThreadId, title }
        );
        threads.addOptimisticThread(currentThreadId, title);
      }

      logger.log("sendMessage:start", {
        threadId: currentThreadId,
        messageLength: message.length,
        hasStateFunction: !!config?.state,
      });

      // If we have a state function, we need to inject it into the message sending
      if (config?.state) {
        // Create a custom sendMessage that includes our state function
        await agent.sendMessageToThread(currentThreadId, message, {
          ...options,
          state: config.state, // Pass the state function
        });
      } else {
        // Use the regular agent sendMessage
        await agent.sendMessage(message, options);
      }
      
      logger.log("sendMessage:sent", {
        threadId: currentThreadId,
      });
    },
    [
      agent.messages.length,
      agent.sendMessage,
      agent.sendMessageToThread,
      currentThreadId,
      threads.addOptimisticThread,
      config?.state,
    ]
  );
  
  // 7. HITL (Human-in-the-Loop) action handlers
  const approveToolCall = useCallback(async (toolCallId: string, reason?: string) => {
    if (!transport) {
      logger.error("No transport available for HITL approval");
      return;
    }

    try {
      await transport.approveToolCall({
        toolCallId,
        threadId: currentThreadId,
        action: "approve",
        reason,
      });
      logger.log("Tool call approved:", { toolCallId, threadId: currentThreadId });
    } catch (error) {
      logger.error("Failed to approve tool call:", error);
      // Could dispatch an error state here if needed
    }
  }, [transport, currentThreadId, logger]);

  const denyToolCall = useCallback(async (toolCallId: string, reason?: string) => {
    if (!transport) {
      logger.error("No transport available for HITL denial");
      return;
    }

    try {
      await transport.approveToolCall({
        toolCallId,
        threadId: currentThreadId,
        action: "deny",
        reason,
      });
      logger.log("Tool call denied:", { toolCallId, threadId: currentThreadId, reason });
    } catch (error) {
      logger.error("Failed to deny tool call:", error);
      // Could dispatch an error state here if needed
    }
  }, [transport, currentThreadId, logger]);
  
  // 7.8. Additional escape hatches for power users
  const setCurrentThreadId = useCallback((threadId: string) => {
    // Low-level escape hatch: immediate thread switch without loading history
    // Perfect for ephemeral scenarios where history loading isn't needed
    agent.setCurrentThread(threadId);
    threads.setCurrentThreadId(threadId);
    
    logger.log('setCurrentThreadId:immediate', {
      threadId,
      skipHistoryLoading: true,
      timestamp: new Date().toISOString()
    });
  }, [agent.setCurrentThread, threads.setCurrentThreadId]);

  const loadThreadHistory = useCallback(async (threadId: string): Promise<ConversationMessage[]> => {
    // Load and convert thread history without switching to it
    try {
      let dbMessages: any[];
      if (transport) {
        dbMessages = await transport.fetchHistory({ threadId });
      } else {
        const response = await fetch(`/api/threads/${threadId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch thread history');
        }
        const data = await response.json();
        dbMessages = data.messages;
      }
      return convertDatabaseToUIFormat(dbMessages);
    } catch (error) {
      logger.error('Failed to load thread history:', error);
      return [];
    }
  }, [transport]);

  const clearThreadMessages = useCallback((threadId: string) => {
    // Clear all messages from a specific thread
    agent.clearThreadMessages(threadId);
  }, [agent.clearThreadMessages]);

  const replaceThreadMessages = useCallback((threadId: string, messages: ConversationMessage[]) => {
    // Replace all messages in a specific thread with provided messages
    agent.replaceThreadMessages(threadId, messages);
  }, [agent.replaceThreadMessages]);
  
  // 8. Hybrid thread creation function (supports both patterns)
  const createNewThread = useCallback(() => {
    const newThreadId = uuidv4();
    
    // Update both agent and threads state for proper coordination
    agent.setCurrentThread(newThreadId);
    threads.setCurrentThreadId(newThreadId);
    
    logger.log('createNewThread', {
      newThreadId,
      usage: 'hybrid-pattern',
      timestamp: new Date().toISOString()
    });
    
    return newThreadId;
  }, [agent.setCurrentThread, threads.setCurrentThreadId]);
  
  // 8.5. State rehydration function for editing messages from previous contexts
  const rehydrateMessageState = useCallback((messageId: string) => {
    // Find the message in the current thread
    const message = agent.messages.find(m => m.id === messageId);
    if (!message?.clientState) {
      logger.log('No client state found for message:', messageId);
      return;
    }
    
    logger.log('Rehydrating client state for message:', {
      messageId,
      clientState: message.clientState,
      timestamp: new Date().toISOString()
    });
    
    // Call the rehydration callback if provided
    config?.onStateRehydrate?.(message.clientState, messageId);
  }, [agent.messages, config?.onStateRehydrate, logger]);
  
  // 9. Merge thread list with agent unread state
  const threadsWithUnreadState = threads.threads.map(thread => ({
    ...thread,
    hasNewMessages: agent.threads[thread.id]?.hasNewMessages || false,
  }));
  
  // 🔍 DIAGNOSTIC: Verify unread state merging
  const unreadCount = threadsWithUnreadState.filter(t => t.hasNewMessages).length;
  if (unreadCount > 0) {
    logger.log('Unread threads detected:', {
      totalThreads: threadsWithUnreadState.length,
      unreadCount,
      unreadThreads: threadsWithUnreadState.filter(t => t.hasNewMessages).map(t => t.id),
      timestamp: new Date().toISOString()
    });
  }

  return {
    // Agent state
    messages: agent.messages,
    status: agent.status,
    isConnected: agent.isConnected,
    currentAgent: agent.currentAgent,
    error: agent.error,
    clearError: agent.clearError,
    
    // Thread state (enhanced with unread indicators)
    threads: threadsWithUnreadState,
    threadsLoading: threads.loading,
    threadsHasMore: threads.hasMore,
    threadsError: threads.error,
    currentThreadId: threads.currentThreadId,
    
    // Loading state for initial thread
    isLoadingInitialThread,
    
    // Unified actions (all coordination handled internally)
    sendMessage,
    sendMessageToThread: agent.sendMessageToThread, // NEW: Expose for advanced use cases
    cancel: agent.cancel, // NEW: Expose cancel functionality
    approveToolCall, // NEW: HITL approval
    denyToolCall, // NEW: HITL denial
    
    // Thread switching - progressive enhancement pattern
    switchToThread, // High-level: automatic history loading
    setCurrentThreadId, // Low-level escape hatch: immediate switch
    
    // Additional escape hatches for power users
    loadThreadHistory, // Load history without switching
    clearThreadMessages, // Clear specific thread messages  
    replaceThreadMessages, // Replace specific thread messages
    
    deleteThread: threads.deleteThread,
    loadMoreThreads: threads.loadMore,
    refreshThreads: threads.refresh,
    
    // Thread creation (hybrid pattern support)
    createNewThread,
    
    // NEW: State rehydration for editing messages from previous contexts
    rehydrateMessageState,
  };
};
