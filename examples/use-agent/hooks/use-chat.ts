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
  const ids = result.map(m => m.id);
  const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  if (dupes.length > 0) {
    console.warn(`[AK][DB][DUP] convert`, { duplicateIds: dupes });
  }
  return result;
};

export const useChat = (config?: UseChatConfig): UseChatReturn => {
  // Stable thread ID generation - only create once
  const [fallbackThreadId] = useState(() => config?.initialThreadId || uuidv4());
  
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
  
  // 4. Use global agent instance if available, otherwise create local instance
  const globalAgent = useGlobalAgent();
  
  const localAgent = useAgent({
    threadId: currentThreadId,
    userId: config?.userId || TEST_USER_ID,
    debug: config?.debug,
  });
  
  // Use global agent if available, otherwise fall back to local agent
  const agent = globalAgent || localAgent;

  // Tag source for diagnostics once per mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__AK_AGENT_SOURCE__ = globalAgent ? 'provider' : 'local';
      console.log(`[AK][CHAT][AGENT-SOURCE]`, { chosen: globalAgent ? 'global' : 'local' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // 5. Sync agent to current thread (works for both global and local agents)
  useEffect(() => {
    if (currentThreadId && currentThreadId !== agent.currentThreadId) {
      agent.setCurrentThread(currentThreadId);
    }
  }, [currentThreadId, agent.currentThreadId, agent.setCurrentThread]);
  
  // 6. Sophisticated thread switching with smart deduplication
  const switchToThread = useCallback(async (selectedThreadId: string) => {
    try {
      console.log(`[AK][THREAD] switch:start`, { to: selectedThreadId });
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
      }
    } catch (err) {
      console.error('[AK][THREAD] switch:error', err);
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
    return newThreadId;
  }, [agent.setCurrentThread, agent.clearThreadMessages, threads.setCurrentThreadId]);
  
  // 8. Enhanced message sending with optimistic updates
  const sendMessage = useCallback(async (message: string, options?: { messageId?: string }) => {
    // If this is the first message in a new thread, add to sidebar optimistically
    if (agent.messages.length === 0 && threads.currentThreadId) {
      const title = message.length > 50 ? message.substring(0, 47) + "..." : message;
      threads.addOptimisticThread(threads.currentThreadId, title);
    }
    
    await agent.sendMessage(message, options);
  }, [agent.messages.length, agent.sendMessage, threads.currentThreadId, threads.addOptimisticThread]);
  
  return {
    // Agent state
    messages: agent.messages,
    status: agent.status,
    isConnected: agent.isConnected,
    currentAgent: agent.currentAgent,
    error: agent.error,
    clearError: agent.clearError,
    
    // Thread state
    threads: threads.threads,
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
