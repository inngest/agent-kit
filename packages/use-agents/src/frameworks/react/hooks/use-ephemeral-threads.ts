"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { type Thread, createDebugLogger } from '../../../types/index.js';

/**
 * @deprecated Use `createInMemorySessionTransport()` with `useAgents` instead.
 * Configuration options for the useEphemeralThreads hook.
 * 
 * @interface UseEphemeralThreadsOptions
 */
interface UseEphemeralThreadsOptions {
  /** Storage type for thread persistence ('session' survives tab, 'local' survives browser restart) */
  storageType?: 'session' | 'local';
  /** User identifier used as part of the storage key for data isolation */
  userId: string;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * @deprecated Use `createInMemorySessionTransport()` with `useAgents` instead.
 * A React hook for managing ephemeral conversation threads using browser storage.
 * 
 * This hook provides thread management capabilities without requiring a backend
 * database. Threads are stored locally in the browser (sessionStorage or localStorage)
 * making it perfect for demos, prototypes, or scenarios where you want to avoid
 * backend persistence complexity.
 * 
 * ## Use Cases
 * 
 * - **Prototyping**: Quick setup without database requirements
 * - **Guest Users**: Temporary conversations without account creation
 * - **Offline Support**: Works without network connectivity
 * - **Development**: Local testing without backend setup
 * - **Embedded Scenarios**: Isolated conversations within larger applications
 * 
 * ## Storage Options
 * 
 * - **Session Storage**: Threads persist until browser tab is closed
 * - **Local Storage**: Threads persist until explicitly cleared or browser data reset
 * 
 * ## Compatibility
 * 
 * This hook implements the same interface as useThreads, making it a drop-in
 * replacement for scenarios requiring client-side persistence.
 * 
 * @param options - Configuration for ephemeral thread management
 * @param options.storageType - Browser storage type ('session' or 'local')
 * @param options.userId - User identifier for data isolation
 * @param options.debug - Enable debug logging
 * 
 * @returns Object with thread management functions compatible with useThreads
 * 
 * @example
 * ```typescript
 * // Basic usage for guest chat
 * function GuestChat() {
 *   const ephemeralThreads = useEphemeralThreads({
 *     userId: 'guest-user',
 *     storageType: 'session'
 *   });
 *   
 *   const chat = useChat({
 *     userId: 'guest-user',
 *     enableThreadValidation: false, // No backend validation
 *     fetchThreads: ephemeralThreads.fetchThreads,
 *     createThread: ephemeralThreads.createThread,
 *     deleteThread: ephemeralThreads.deleteThread,
 *   });
 *   
 *   return <ChatInterface {...chat} />;
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Playground/demo usage with persistent storage
 * function DemoPlayground() {
 *   const { threads, createThread, deleteThread, clearCache } = useEphemeralThreads({
 *     userId: 'demo-user',
 *     storageType: 'local', // Persists across browser restarts
 *     debug: true
 *   });
 *   
 *   return (
 *     <div>
 *       <button onClick={() => createThread()}>New Demo</button>
 *       <button onClick={clearCache}>Reset All</button>
 *       {threads.map(thread => (
 *         <div key={thread.id}>
 *           {thread.title} ({thread.messageCount} messages)
 *           <button onClick={() => deleteThread(thread.id)}>Delete</button>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEphemeralThreads({ 
  storageType = 'session', 
  userId,
  debug = false
}: UseEphemeralThreadsOptions) {
  // Create debug logger
  const logger = useMemo(() => createDebugLogger('useEphemeralThreads', debug), [debug]);
  
  const cacheKey = `ephemeral_threads_${userId}`;
  
  // Safely access storage only on the client-side
  const storage = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return storageType === 'local' ? localStorage : sessionStorage;
  }, [storageType]);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  // Load from storage on mount
  useEffect(() => {
    if (!storage) return;
    try {
      const cached = storage.getItem(cacheKey);
      if (cached) {
        const parsedThreads = JSON.parse(cached).map((t: any) => ({
          ...t,
          lastMessageAt: new Date(t.lastMessageAt),
          createdAt: new Date(t.createdAt),
          updatedAt: new Date(t.updatedAt),
        }));
        setThreads(parsedThreads);
      }
    } catch (e) {
      logger.error(`Failed to load threads from ${storageType}Storage`, e);
    }
  }, [cacheKey, storage, storageType]);

  const persistThreads = (updatedThreads: Thread[]) => {
    setThreads(updatedThreads);
    if (!storage) return;
    try {
      storage.setItem(cacheKey, JSON.stringify(updatedThreads));
    } catch (e) {
      logger.error(`Failed to save threads to ${storageType}Storage`, e);
    }
  };

  const createThread = useCallback(async (): Promise<{ threadId: string; title: string }> => {
    const newThread: Thread = {
      id: uuidv4(),
      title: 'New Query',
      messageCount: 0,
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setThreads(current => {
      const newThreads = [newThread, ...current];
      persistThreads(newThreads);
      return newThreads;
    });

    return { threadId: newThread.id, title: newThread.title || 'New conversation' };
  }, [persistThreads]);

  const deleteThread = useCallback(async (threadId: string): Promise<void> => {
    setThreads(current => {
      const newThreads = current.filter(t => t.id !== threadId);
      persistThreads(newThreads);
      return newThreads;
    });
  }, [persistThreads]);

  const fetchThreads = useCallback(async (userId: string, pagination: { limit: number; offset: number }): Promise<{
    threads: Thread[];
    hasMore: boolean;
    total: number;
  }> => {
    return {
      threads: threads,
      hasMore: false,
      total: threads.length,
    };
  }, [threads]);

  return {
    threads,
    loading: false,
    hasMore: false,
    error: null,
    currentThreadId,
    setCurrentThreadId,
    createThread,
    deleteThread,
    fetchThreads,
    // Provide dummy functions for the rest of the interface
    loadMore: async () => {},
    refresh: async () => {},
    addOptimisticThread: (threadId: string, title: string) => {
      // In this ephemeral model, createThread is not optimistic, so this can be a no-op
    },
    fetchHistory: async (threadId: string) => [],
    clearCache: () => {
      if (!storage) return;
      try {
        storage.removeItem(cacheKey);
        setThreads([]);
      } catch (e) {
        logger.error(`Failed to clear cache from ${storageType}Storage`, e);
      }
    },
  };
}
