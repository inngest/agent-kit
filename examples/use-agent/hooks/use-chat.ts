import { useState, useCallback, useEffect } from 'react';
import { useThreads, type Thread } from './use-threads';
import { useGlobalAgent } from '@/contexts/AgentContext';
import { useAgent, type ConversationMessage, type AgentStatus } from './use-agent';
import { v4 as uuidv4 } from 'uuid';
import { TEST_USER_ID } from '@/lib/constants';

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
  createNewThread: () => string;
  switchToThread: (threadId: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  loadMoreThreads: () => Promise<void>;
  refreshThreads: () => Promise<void>;
}

export interface UseChatConfig {
  userId?: string;
  initialThreadId?: string;
  debug?: boolean;
  
  // Custom fetch functions for flexibility
  fetchThreads?: (userId: string, pagination: { limit: number; offset: number }) => Promise<{
    threads: Thread[];
    hasMore: boolean;
    total: number;
  }>;
  fetchHistory?: (threadId: string) => Promise<any[]>;
  createThreadFn?: (userId: string) => Promise<{ threadId: string; title: string }>;
  deleteThreadFn?: (threadId: string) => Promise<void>;
  renameThreadFn?: (threadId: string, title: string) => Promise<void>;
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
  // Stable thread ID generation - only create once
  const [fallbackThreadId] = useState(() => config?.initialThreadId || uuidv4());
  
  // Instance tracking for telemetry
  const [instanceId] = useState(() => Math.random().toString(36).substr(2, 8));
  console.log('[AK_TELEMETRY] useChat.instance', { instanceId, initialThreadId: config?.initialThreadId });
  
  // 1. Thread management hook
  const threads = useThreads({
    userId: config?.userId || TEST_USER_ID,
    fetchThreads: config?.fetchThreads,
    fetchHistory: config?.fetchHistory,
    createThreadFn: config?.createThreadFn,
    deleteThreadFn: config?.deleteThreadFn,
    renameThreadFn: config?.renameThreadFn,
  });
  
  // 2. Stable threadId - prevents constant regeneration  
  const currentThreadId = threads.currentThreadId || fallbackThreadId;
  
  // 3. Initialize thread if provided via config
  useEffect(() => {
    if (config?.initialThreadId && threads.currentThreadId !== config.initialThreadId) {
      threads.setCurrentThreadId(config.initialThreadId);
    }
  }, [config?.initialThreadId, threads.currentThreadId, threads.setCurrentThreadId]);
  
  // 4. Require global agent from provider - no local fallback
  const globalAgent = useGlobalAgent();
  
  if (!globalAgent) {
    throw new Error(
      'useChat requires AgentProvider to be mounted in a parent component. ' +
      'Wrap your app with <AgentProvider> in layout.tsx or use useAgent directly if you need an independent connection.'
    );
  }
  
  const agent = globalAgent;
  
  // 🔍 DIAGNOSTIC: Verify single agent instance
  console.log('🔍 [DIAG] useChat using global agent:', {
    hasGlobalAgent: !!globalAgent,
    agentConnected: agent.isConnected,
    currentThread: agent.currentThreadId,
    timestamp: new Date().toISOString()
  });
  
  // 5. Sync agent to current thread (works for both global and local agents)
  useEffect(() => {
    if (currentThreadId && currentThreadId !== agent.currentThreadId) {
      agent.setCurrentThread(currentThreadId);
    }
  }, [currentThreadId, agent.currentThreadId, agent.setCurrentThread]);
  
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
      
      // Step 3: Load historical messages from database
      const response = await fetch(`/api/threads/${selectedThreadId}`);
      if (response.ok) {
        const data = await response.json();
        const historicalMessages = convertDatabaseToUIFormat(data.messages);

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
      }
    } catch (err) {
      console.error('[useChat] Error switching thread:', err);
      console.log('[AK_TELEMETRY] useChat.switchToThread:error', { selectedThreadId, error: err instanceof Error ? err.message : String(err) });
    }
  }, [agent, agent.setCurrentThread, agent.getThread, agent.replaceThreadMessages]);

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
  
  // 7. New thread creation
  const createNewThread = useCallback((): string => {
    const newThreadId = uuidv4();
    agent.setCurrentThread(newThreadId);
    agent.clearThreadMessages(newThreadId);
    threads.setCurrentThreadId(newThreadId);
    console.log('[AK_TELEMETRY] useChat.createNewThread', { newThreadId });
    return newThreadId;
  }, [agent.setCurrentThread, agent.clearThreadMessages, threads.setCurrentThreadId]);

  // 8. Enhanced message sending with optimistic updates
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
      });
      await agent.sendMessage(message, options);
      console.log("[AK_TELEMETRY] useChat.sendMessage:sent", {
        threadId: currentThreadId,
      });
    },
    [
      agent.messages.length,
      agent.sendMessage,
      currentThreadId,
      threads.addOptimisticThread,
    ]
  );
  
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
    createNewThread,
    switchToThread,
    deleteThread: threads.deleteThread,
    loadMoreThreads: threads.loadMore,
    refreshThreads: threads.refresh,
  };
};
