import { useState, useCallback, useEffect } from 'react';
import { useThreads, type Thread } from './use-threads';
import { useGlobalAgent } from '@/contexts/AgentContext';
import { type ConversationMessage, type AgentStatus } from './use-agent';
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
  sendMessage: (message: string) => Promise<void>;
  createNewThread: () => void;
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
  return dbMessages.map((msg, index) => {
    if (msg.type === 'user') {
      return {
        id: `loaded-${index}`,
        role: 'user' as const,
        parts: [{
          type: 'text' as const,
          id: `loaded-text-${index}`,
          content: msg.content || 'No content',
          status: 'complete' as const
        }],
        timestamp: new Date(msg.createdAt),
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
        id: `loaded-${index}`,
        role: 'assistant' as const,
        parts: [{
          type: 'text' as const,
          id: `loaded-text-${index}`,
          content,
          status: 'complete' as const
        }],
        agentId: msg.agentName,
        timestamp: new Date(msg.createdAt),
      };
    }
  });
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
      console.log(`[useChat] Setting initial thread to: ${config.initialThreadId}`);
      threads.setCurrentThreadId(config.initialThreadId);
    }
  }, [config?.initialThreadId, threads.currentThreadId, threads.setCurrentThreadId]);
  
  // 4. Use global agent instance (stable subscription, no recreation)
  const agent = useGlobalAgent();
  
  // 5. Sync global agent to current thread
  useEffect(() => {
    if (currentThreadId && currentThreadId !== agent.currentThreadId) {
      console.log(`[useChat] Syncing global agent to thread: ${currentThreadId} (was: ${agent.currentThreadId})`);
      agent.setCurrentThread(currentThreadId);
    }
  }, [currentThreadId, agent.currentThreadId, agent.setCurrentThread]);
  
  // 6. Sophisticated thread switching with smart deduplication
  const switchToThread = useCallback(async (selectedThreadId: string) => {
    console.log(`🔄 [SWITCH-THREAD] Starting switch to thread: ${selectedThreadId}`, {
      agentCurrentThreadId: agent.currentThreadId,
      selectedThreadId,
      timestamp: new Date().toISOString()
    });
    
    try {
      // CRITICAL: Only skip loading if we're on the same thread AND already have messages
      const currentThread = agent.getThread(selectedThreadId);
      const hasExistingMessages = currentThread && currentThread.messages.length > 0;
      
      console.log(`🔍 [SWITCH-THREAD] Thread state check:`, {
        selectedThreadId,
        agentCurrentThreadId: agent.currentThreadId,
        threadExists: !!currentThread,
        messageCount: currentThread?.messages.length || 0,
        hasExistingMessages,
        willSkip: selectedThreadId === agent.currentThreadId && hasExistingMessages
      });
      
      if (selectedThreadId === agent.currentThreadId && hasExistingMessages) {
        console.log('🚫 [SWITCH-THREAD] Already on this thread with messages, skipping reload:', selectedThreadId);
        return;
      }
      
      // Step 1: Switch to the thread immediately (shows any existing messages)
      agent.setCurrentThread(selectedThreadId);
      threads.setCurrentThreadId(selectedThreadId);
      
      // Step 2: Capture any optimistic messages that might exist in the thread
      const existingThread = agent.getThread(selectedThreadId);
      const rawOptimisticMessages = existingThread?.messages || [];
      
      // CRITICAL: Remove any internal duplicates from optimistic messages first
      const seenOptimisticIds = new Set();
      const optimisticMessages = rawOptimisticMessages.filter(msg => {
        if (seenOptimisticIds.has(msg.id)) {
          console.log(`🔍 [DEDUP-OPTIMISTIC] Removing duplicate optimistic message: ${msg.id}`);
          return false;
        }
        seenOptimisticIds.add(msg.id);
        return true;
      });
      
      // Only log if there are duplicates to report
      if (rawOptimisticMessages.length !== optimisticMessages.length) {
        console.log(`🔍 [THREAD-SWITCH] Removed ${rawOptimisticMessages.length - optimisticMessages.length} duplicate optimistic messages in thread ${selectedThreadId}`);
      }
      
      // Step 3: Load historical messages from database
      const response = await fetch(`/api/threads/${selectedThreadId}`);
      if (response.ok) {
        const data = await response.json();
        
        // Convert database messages to UI format
        const historicalMessages = data.messages.map((msg: any, index: number) => {
          if (msg.type === 'user') {
            return {
              id: `${selectedThreadId}-user-${index}`,
              role: 'user' as const,
              parts: [{
                type: 'text' as const,
                id: `${selectedThreadId}-text-${index}`,
                content: msg.content || 'No content',
                status: 'complete' as const
              }],
              timestamp: new Date(msg.createdAt),
            };
          } else {
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
              id: `${selectedThreadId}-assistant-${index}`,
              role: 'assistant' as const,
              parts: [{
                type: 'text' as const,
                id: `${selectedThreadId}-text-${index}`,
                content,
                status: 'complete' as const
              }],
              agentId: msg.agentName,
              timestamp: new Date(msg.createdAt),
            };
          }
        });
        
        // Step 4: Smart merge strategy - if database has recent messages, trust it completely
        const cutoffTime = Date.now() - (30 * 1000); // 30 seconds
        const hasRecentHistoricalMessages = historicalMessages.some((m: any) => 
          new Date(m.timestamp).getTime() > cutoffTime
        );
        
        if (hasRecentHistoricalMessages) {
          console.log(`📊 [SMART-MERGE] Database has recent messages, using historical data only for thread ${selectedThreadId} (${historicalMessages.length} messages)`);
          
          // Database is up-to-date, use historical messages only
          agent.replaceThreadMessages(selectedThreadId, historicalMessages);
          return;
        }
        
        console.log(`📊 [SMART-MERGE] No recent database messages, performing intelligent merge for thread ${selectedThreadId}`);
        
        // Create comprehensive deduplication - check both IDs and content
        const seenMessages = new Map(); // id -> message
        const seenContent = new Map(); // content hash -> message
        
        // Helper to extract text content for comparison
        const getMessageContent = (msg: any) => {
          if (msg.parts && msg.parts[0] && msg.parts[0].content) {
            return msg.parts[0].content;
          }
          return msg.content || '';
        };
        
        // Process historical messages first (they have priority)
        historicalMessages.forEach((msg: any) => {
          // SAFETY: Check if this historical message ID is already seen
          if (seenMessages.has(msg.id)) {
            console.warn(`🚨 [HISTORICAL-DUP] Duplicate ID in historical messages: ${msg.id}`);
            return; // Skip this duplicate historical message
          }
          
          seenMessages.set(msg.id, msg);
          const content = getMessageContent(msg);
          if (content) {
            seenContent.set(content, msg);
          }
        });
        
        // Filter optimistic messages with comprehensive deduplication
        const uniqueOptimisticMessages = optimisticMessages.filter(msg => {
          const msgContent = getMessageContent(msg);
          const msgTimestamp = msg.timestamp.getTime();
          
          // SAFETY: Check if this optimistic message ID is already seen
          if (seenMessages.has(msg.id)) {
            console.log(`🔍 [DEDUP-ID] Skipping duplicate optimistic ID: ${msg.id}`);
            return false;
          }
          
          // CRITICAL: Content-based deduplication for ALL messages
          if (msgContent && seenContent.has(msgContent)) {
            const existingMsg = seenContent.get(msgContent);
            console.log(`🔍 [DEDUP-CONTENT] Skipping duplicate content for ${msg.role} message: "${msgContent.substring(0, 30)}..." (Optimistic ID: ${msg.id}, Historical ID: ${existingMsg.id})`);
            return false;
          }
          
          // ENHANCED: Timestamp-based deduplication for user messages
          // Check if any historical message has similar content AND similar timestamp (within 5 seconds)
          if (msg.role === 'user' && msgContent) {
            const timestampWindow = 5000; // 5 seconds
            const hasSimilarMessage = historicalMessages.some((histMsg: any) => {
              const histContent = getMessageContent(histMsg);
              const histTimestamp = new Date(histMsg.timestamp).getTime();
              const timeDiff = Math.abs(msgTimestamp - histTimestamp);
              
              return (
                histMsg.role === 'user' && 
                histContent === msgContent && 
                timeDiff < timestampWindow
              );
            });
            
            if (hasSimilarMessage) {
              console.log(`🔍 [DEDUP-TIMESTAMP] Skipping user message with similar timestamp and content: "${msgContent.substring(0, 30)}..." (ID: ${msg.id}, Timestamp: ${new Date(msgTimestamp).toISOString()})`);
              return false;
            }
          }
          
          // Only keep recent optimistic messages (60 seconds for user messages, 30 for others)
          const timeWindow = msg.role === 'user' ? 60000 : 30000;
          const isRecent = msgTimestamp > (Date.now() - timeWindow);
          if (!isRecent) {
            console.log(`🔍 [DEDUP-OLD] Skipping old optimistic message: ${msg.id} (${new Date(msgTimestamp).toISOString()})`);
            return false;
          }
          
          // FINAL CHECK: Ensure we're not adding a user message that already exists in database
          if (msg.role === 'user' && msgContent) {
            const hasExactUserContent = historicalMessages.some((histMsg: any) => 
              histMsg.role === 'user' && getMessageContent(histMsg) === msgContent
            );
            
            if (hasExactUserContent) {
              console.log(`🔍 [DEDUP-EXACT-USER] Skipping user message already in database: "${msgContent.substring(0, 30)}..." (ID: ${msg.id})`);
              return false;
            }
          }
          
          // Add to seen maps to prevent future duplicates within this merge
          seenMessages.set(msg.id, msg);
          if (msgContent) {
            seenContent.set(msgContent, msg);
          }
          
          console.log(`✅ [PRESERVE-OPTIMISTIC] Keeping optimistic ${msg.role} message: ${msg.id} (${new Date(msgTimestamp).toISOString()})`);
          return true;
        });
        
        // Create final merged array with guaranteed unique messages
        const mergedMessages = [...historicalMessages, ...uniqueOptimisticMessages];
        
        // Final safety check for duplicate IDs
        const finalIds = mergedMessages.map(m => m.id);
        const uniqueFinalIds = new Set(finalIds);
        if (finalIds.length !== uniqueFinalIds.size) {
          const duplicateIds = finalIds.filter((id, index) => finalIds.indexOf(id) !== index);
          console.error(`🚨 [FINAL-DUPLICATE-CHECK] CRITICAL: Still found duplicate IDs after deduplication!`, {
            totalMessages: finalIds.length,
            uniqueIds: uniqueFinalIds.size,
            duplicateIds,
          });
          
          // EMERGENCY FIX: Force deduplication before loading
          const emergencyDeduplicatedMap = new Map();
          mergedMessages.forEach(msg => {
            emergencyDeduplicatedMap.set(msg.id, msg);
          });
          const emergencyDeduplicatedMessages = Array.from(emergencyDeduplicatedMap.values());
          
          console.log(`🚨 [EMERGENCY-FIX] Force deduplicating: ${mergedMessages.length} → ${emergencyDeduplicatedMessages.length}`);
          agent.replaceThreadMessages(selectedThreadId, emergencyDeduplicatedMessages);
          console.log(`✅ Loaded ${emergencyDeduplicatedMessages.length} emergency-deduplicated messages`);
          return; // Exit early after emergency fix
        }
        
        // Load the intelligently merged and deduplicated messages
        agent.replaceThreadMessages(selectedThreadId, mergedMessages);
      }
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  }, [agent.currentThreadId, agent.setCurrentThread, agent.getThread, agent.replaceThreadMessages]);

  // Auto-load initial thread data when initialThreadId is provided
  const [isLoadingInitialThread, setIsLoadingInitialThread] = useState(!!config?.initialThreadId);
  const [hasLoadedInitialThread, setHasLoadedInitialThread] = useState(false);
  
  useEffect(() => {
    if (config?.initialThreadId && !hasLoadedInitialThread && agent.currentThreadId) {
      console.log(`[useChat] Auto-loading thread: ${config.initialThreadId}`);
      setHasLoadedInitialThread(true);
      setIsLoadingInitialThread(true);
      
      // Load thread data immediately
      switchToThread(config.initialThreadId)
        .then(() => {
          console.log(`[useChat] Successfully loaded thread: ${config.initialThreadId}`);
        })
        .catch(err => {
          console.error('Failed to load initial thread:', err);
        })
        .finally(() => {
          setIsLoadingInitialThread(false);
        });
    }
  }, [config?.initialThreadId, hasLoadedInitialThread, agent.currentThreadId, switchToThread]);
  
  // 7. New thread creation
  const createNewThread = useCallback(() => {
    const newThreadId = uuidv4();
    agent.setCurrentThread(newThreadId);
    agent.clearThreadMessages(newThreadId);
    threads.setCurrentThreadId(newThreadId);
  }, [agent.setCurrentThread, agent.clearThreadMessages, threads.setCurrentThreadId]);
  
  // 8. Enhanced message sending with optimistic updates
  const sendMessage = useCallback(async (message: string) => {
    // If this is the first message in a new thread, add to sidebar optimistically
    if (agent.messages.length === 0 && threads.currentThreadId) {
      const title = message.length > 50 ? message.substring(0, 47) + "..." : message;
      threads.addOptimisticThread(threads.currentThreadId, title);
    }
    
    await agent.sendMessage(message);
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
