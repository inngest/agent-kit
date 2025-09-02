import { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { type Thread } from './types';

interface UseEphemeralThreadsOptions {
  storageType?: 'session' | 'local';
  userId: string; // Used as part of the storage key
}

export function useEphemeralThreads({ 
  storageType = 'session', 
  userId 
}: UseEphemeralThreadsOptions) {
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
      console.error(`Failed to load threads from ${storageType}Storage`, e);
    }
  }, [cacheKey, storage, storageType]);

  const persistThreads = (updatedThreads: Thread[]) => {
    setThreads(updatedThreads);
    if (!storage) return;
    try {
      storage.setItem(cacheKey, JSON.stringify(updatedThreads));
    } catch (e) {
      console.error(`Failed to save threads to ${storageType}Storage`, e);
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

    return { threadId: newThread.id, title: newThread.title };
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
        console.error(`Failed to clear cache from ${storageType}Storage`, e);
      }
    },
  };
}
