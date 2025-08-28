import { useState, useEffect, useCallback, useMemo } from 'react';
import { TEST_USER_ID } from '@/lib/constants';

export interface Thread {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UseThreadsReturn {
  threads: Thread[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  createThread: () => Promise<string>;
  deleteThread: (threadId: string) => Promise<void>;
  addOptimisticThread: (threadId: string, title: string) => void;
  currentThreadId: string | null;
  setCurrentThreadId: (id: string | null) => void;
  
  // NEW: Thread content loading
  loadThreadHistory: (threadId: string) => Promise<any[]>;
}

export function useThreads(config?: {
  userId?: string;
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
}): UseThreadsReturn {
  const userId = config?.userId || TEST_USER_ID;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  // Stable default fetch functions using useCallback
  const fetchThreadsDefault = useCallback(async (userId: string, pagination: { limit: number; offset: number }) => {
    const response = await fetch(
      `/api/threads?userId=${encodeURIComponent(userId)}&limit=${pagination.limit}&offset=${pagination.offset}`
    );
    if (!response.ok) {
      console.error(`[AK][THREADS] list:fail`, { status: response.status });
      throw new Error('Failed to load threads');
    }
    return response.json();
  }, []);

  const fetchHistoryDefault = useCallback(async (threadId: string) => {
    const response = await fetch(`/api/threads/${threadId}`);
    if (!response.ok) {
      console.error(`[AK][THREADS] history:fail`, { threadId, status: response.status });
      throw new Error('Failed to load thread history');
    }
    const data = await response.json();
    return data.messages;
  }, []);

  const createThreadDefault = useCallback(async (userId: string) => {
    const response = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      console.error(`[AK][THREADS] create:fail`, { status: response.status });
      throw new Error('Failed to create thread');
    }
    return response.json();
  }, []);

  const deleteThreadDefault = useCallback(async (threadId: string) => {
    const response = await fetch(`/api/threads/${threadId}`, { method: 'DELETE' });
    if (!response.ok) {
      console.error(`[AK][THREADS] delete:fail`, { threadId, status: response.status });
      throw new Error('Failed to delete thread');
    }
  }, []);

  // Use provided functions or stable defaults
  const fetchThreadsFn = config?.fetchThreads || fetchThreadsDefault;
  const fetchHistoryFn = config?.fetchHistory || fetchHistoryDefault;
  const createThreadFn = config?.createThreadFn || createThreadDefault;
  const deleteThreadFn = config?.deleteThreadFn || deleteThreadDefault;

  const loadThreads = useCallback(async (isLoadMore = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const currentOffset = isLoadMore ? offset : 0;
      const data = await fetchThreadsFn(userId, { limit: 20, offset: currentOffset });
      
      if (isLoadMore) {
        setThreads(prev => [...prev, ...data.threads]);
        setOffset(prev => prev + data.threads.length);
      } else {
        setThreads(data.threads);
        setOffset(data.threads.length);
      }
      
      setHasMore(data.hasMore);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load threads';
      setError(errorMessage);
      console.error('[AK][THREADS] load:error', err);
    } finally {
      setLoading(false);
    }
  }, [userId, offset, fetchThreadsFn]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await loadThreads(true);
  }, [hasMore, loading, loadThreads]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await loadThreads(false);
  }, [loadThreads]);

  const createThread = useCallback(async (): Promise<string> => {
    try {
      const data = await createThreadFn(userId);
      return data.threadId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create thread';
      setError(errorMessage);
      console.error('Error creating thread:', err);
      throw err;
    }
  }, [userId, createThreadFn]);

  const addOptimisticThread = useCallback((threadId: string, title: string) => {
    const newThread: Thread = {
      id: threadId,
      title,
      messageCount: 1, // First message was just sent
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setThreads(prev => {
      // Don't add if it already exists
      if (prev.find(t => t.id === threadId)) {
        return prev;
      }
      return [newThread, ...prev];
    });
  }, []);

  const deleteThread = useCallback(async (threadId: string) => {
    try {
      // Optimistically remove from UI
      setThreads(prev => prev.filter(t => t.id !== threadId));
      
      // If we're deleting the current thread, clear current thread
      if (currentThreadId === threadId) {
        setCurrentThreadId(null);
      }

      await deleteThreadFn(threadId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete thread';
      setError(errorMessage);
      console.error('Error deleting thread:', err);
      
      // Restore thread on error by refreshing
      await refresh();
      throw err;
    }
  }, [currentThreadId, refresh, deleteThreadFn]);

  // NEW: Load thread history method
  const loadThreadHistory = useCallback(async (threadId: string): Promise<any[]> => {
    return fetchHistoryFn(threadId);
  }, [fetchHistoryFn]);

  // Initial load - only when userId changes, not when loadThreads changes
  useEffect(() => {
    loadThreads(false);
  }, [userId]); // Intentionally NOT including loadThreads to prevent loop

  return {
    threads,
    loading,
    hasMore,
    error,
    loadMore,
    refresh,
    createThread,
    deleteThread,
    addOptimisticThread,
    currentThreadId,
    setCurrentThreadId,
    loadThreadHistory,
  };
}



