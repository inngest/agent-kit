import { useState, useCallback, useEffect, useMemo } from 'react';
import { useThreads } from './use-threads';
import { useAgent } from './use-agent';
import { v4 as uuidv4 } from 'uuid';
import { 
  useOptionalGlobalAgent, 
  useOptionalGlobalTransport, 
  useOptionalGlobalUserId, 
  useOptionalGlobalChannelKey,
  useOptionalGlobalResolvedChannelKey
} from './utils/provider-utils';
import { type Thread, type ConversationMessage, type AgentStatus, createDebugLogger } from './types';

export interface UseChatReturn {
  // Agent state (real-time conversation)
  messages: ConversationMessage[];
  status: AgentStatus;
  isConnected: boolean;
  currentAgent?: string;
  error?: { message: string; timestamp: Date; recoverable: boolean };
  clearError: () => void;
  
  // Thread state (persistence & list)
  threads: Thread[];
  threadsLoading: boolean;
  threadsHasMore: boolean;
  threadsError: string | null;
  currentThreadId: string | null;
  
  // Loading state for initial thread
  isLoadingInitialThread: boolean;
  
  // Unified actions (handles coordination automatically)
  sendMessage: (message: string, options?: { messageId?: string }) => Promise<void>;
  cancel: () => Promise<void>; // NEW: Cancel current agent run
  approveToolCall: (toolCallId: string, reason?: string) => Promise<void>; // NEW: HITL approval
  denyToolCall: (toolCallId: string, reason?: string) => Promise<void>; // NEW: HITL denial
  
  // Thread switching - two approaches for different needs
  switchToThread: (threadId: string) => Promise<void>; // High-level: loads history automatically
  setCurrentThreadId: (threadId: string) => void; // Low-level escape hatch: immediate switch, no loading
  
  // Additional escape hatches for power users
  loadThreadHistory: (threadId: string) => Promise<ConversationMessage[]>;
  clearThreadMessages: (threadId: string) => void;
  replaceThreadMessages: (threadId: string, messages: ConversationMessage[]) => void;
  
  deleteThread: (threadId: string) => Promise<void>;
  loadMoreThreads: () => Promise<void>;
  refreshThreads: () => Promise<void>;
  
  // Thread creation (supports both URL-driven and function-driven patterns)
  createNewThread: () => string;
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
 * Database message format converter
 * Converts raw database messages to UI ConversationMessage format
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
    console.warn(`[useChat] Duplicate message IDs from database:`, { duplicateIds: dupes });
  }
  return result;
};

export const useChat = (config?: UseChatConfig): UseChatReturn => {
  // Inherit from provider if available
  const globalUserId = useOptionalGlobalUserId();
  const globalChannelKey = useOptionalGlobalChannelKey();
  const globalResolvedChannelKey = useOptionalGlobalResolvedChannelKey();
  
  // Resolve configuration with provider inheritance
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
    fetchThreads: config?.fetchThreads,
    fetchHistory: config?.fetchHistory,
    createThreadFn: config?.createThread,
    deleteThreadFn: config?.deleteThread,
    renameThreadFn: config?.renameThread,
  });
  
  // 2. Stable threadId - prevents constant regeneration  
  const currentThreadId = threads.currentThreadId || fallbackThreadId;
  
  // 3. Initialize thread if provided via config (ONLY ONCE, not continuously enforced)
  const [hasInitialized, setHasInitialized] = useState(false);
  useEffect(() => {
    if (config?.initialThreadId && !hasInitialized) {
      threads.setCurrentThreadId(config.initialThreadId);
      setHasInitialized(true); // Prevent re-running this effect
      console.log('[AK_TELEMETRY] useChat.initialized:setInitialThread', {
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
  
  // Smart subscription logic: Only disable local subscription if using the SAME channel
  const shouldDisableLocalSubscription = useMemo(() => {
    // No global agent = always enable local subscription (standalone mode)
    if (!globalAgent) return false;
    
    // Global agent exists = disable local subscription ONLY if using same channel (share connection)
    // Different channel = enable local subscription (escape hatch for separate connection)
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
  console.log('🔍 [DIAG] useChat agent resolution:', {
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
      console.log('[AK_TELEMETRY] useChat.switchToThread:start', { selectedThreadId, prevAgentThread: agent.currentThreadId, prevThreadsThread: threads.currentThreadId });
      
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
        console.log('[AK_TELEMETRY] useChat.switchToThread:success', { selectedThreadId, historicalCount: historicalMessages.length, optimisticKept: recentOptimisticMessages.length });
      } catch (historyError) {
        console.warn('[useChat] Failed to load thread history, continuing with optimistic messages:', historyError);
        console.log('[AK_TELEMETRY] useChat.switchToThread:historyError', { selectedThreadId, error: historyError instanceof Error ? historyError.message : String(historyError) });
        // Continue with just optimistic messages if history load fails
      }
    } catch (err) {
      console.error('[useChat] Error switching thread:', err);
      console.log('[AK_TELEMETRY] useChat.switchToThread:error', { selectedThreadId, error: err instanceof Error ? err.message : String(err) });
    }
  }, [agent, agent.setCurrentThread, agent.getThread, agent.replaceThreadMessages, transport]);

  // Auto-load initial thread data when initialThreadId is provided
  const [isLoadingInitialThread, setIsLoadingInitialThread] = useState(!!config?.initialThreadId);
  const [hasLoadedInitialThread, setHasLoadedInitialThread] = useState(false);
  
  useEffect(() => {
    if (config?.initialThreadId && !hasLoadedInitialThread && agent.currentThreadId) {
      setHasLoadedInitialThread(true);
      setIsLoadingInitialThread(true);
      
      // Load thread data immediately
      switchToThread(config.initialThreadId)
        .catch(err => {
          console.error('Failed to load initial thread:', err);
        })
        .finally(() => {
          setIsLoadingInitialThread(false);
        });
    }
  }, [config?.initialThreadId, hasLoadedInitialThread, agent.currentThreadId, switchToThread]);
  
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
          console.warn(`[useChat] Thread not found:`, { requested: config.initialThreadId });
          
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
          console.log(`[useChat] Allowing fresh thread:`, { 
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
        console.log(
          "[AK_TELEMETRY] useChat.sendMessage:optimisticAdd",
          { threadId: currentThreadId, title }
        );
        threads.addOptimisticThread(currentThreadId, title);
      }

      console.log("[AK_TELEMETRY] useChat.sendMessage:start", {
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
      
      console.log("[AK_TELEMETRY] useChat.sendMessage:sent", {
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
    
    console.log('[AK_TELEMETRY] useChat.setCurrentThreadId:immediate', {
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
      console.error('[useChat] Failed to load thread history:', error);
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
    
    console.log('[AK_TELEMETRY] useChat.createNewThread', {
      newThreadId,
      usage: 'hybrid-pattern',
      timestamp: new Date().toISOString()
    });
    
    return newThreadId;
  }, [agent.setCurrentThread, threads.setCurrentThreadId]);
  
  // 9. Merge thread list with agent unread state
  const threadsWithUnreadState = threads.threads.map(thread => ({
    ...thread,
    hasNewMessages: agent.threads[thread.id]?.hasNewMessages || false,
  }));
  
  // 🔍 DIAGNOSTIC: Verify unread state merging
  const unreadCount = threadsWithUnreadState.filter(t => t.hasNewMessages).length;
  if (unreadCount > 0) {
    console.log('🔍 [DIAG] Unread threads detected:', {
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
  };
};
