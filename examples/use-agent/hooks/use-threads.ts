import { useState, useEffect, useCallback } from 'react';
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
}

export function useThreads(userId: string = TEST_USER_ID): UseThreadsReturn {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const loadThreads = useCallback(async (isLoadMore = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const currentOffset = isLoadMore ? offset : 0;
      const response = await fetch(
        `/api/threads?userId=${encodeURIComponent(userId)}&limit=20&offset=${currentOffset}`
      );

      if (!response.ok) {
        throw new Error('Failed to load threads');
      }

      const data = await response.json();
      
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
      console.error('Error loading threads:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, offset]);

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
      const response = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to create thread');
      }

      const data = await response.json();
      return data.threadId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create thread';
      setError(errorMessage);
      console.error('Error creating thread:', err);
      throw err;
    }
  }, [userId]);

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

      const response = await fetch(`/api/threads/${threadId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete thread');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete thread';
      setError(errorMessage);
      console.error('Error deleting thread:', err);
      
      // Restore thread on error by refreshing
      await refresh();
      throw err;
    }
  }, [currentThreadId, refresh]);

  // Initial load
  useEffect(() => {
    loadThreads(false);
  }, [userId]);

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
  };
}



