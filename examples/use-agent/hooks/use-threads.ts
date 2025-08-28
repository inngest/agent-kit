import { useState, useEffect, useCallback, useMemo } from 'react';
import { TEST_USER_ID } from '@/lib/constants';

export interface Thread {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  hasNewMessages?: boolean; // NEW: Unread indicator from agent state
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
  
  // NEW: Cache management
  clearCache: () => void;
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
  
  // Instance tracking for telemetry
  const [instanceId] = useState(() => Math.random().toString(36).substr(2, 8));
  console.log('[AK_TELEMETRY] useThreads.instance', { instanceId, userId });
  
  // Cache key for sessionStorage
  const cacheKey = `threads_${userId}`;
  
  // Initialize state without accessing sessionStorage to avoid hydration mismatch
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  
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
      console.error(`[useThreads] Failed to load threads:`, { status: response.status });
      throw new Error('Failed to load threads');
    }
    return response.json();
  }, []);

  const fetchHistoryDefault = useCallback(async (threadId: string) => {
    const response = await fetch(`/api/threads/${threadId}`);
    if (!response.ok) {
      console.error(`[useThreads] Failed to load thread history:`, { threadId, status: response.status });
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
      console.error(`[useThreads] Failed to create thread:`, { status: response.status });
      throw new Error('Failed to create thread');
    }
    return response.json();
  }, []);

  const deleteThreadDefault = useCallback(async (threadId: string) => {
    const response = await fetch(`/api/threads/${threadId}`, { method: 'DELETE' });
    if (!response.ok) {
      console.error(`[useThreads] Failed to delete thread:`, { threadId, status: response.status });
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
      console.log('[AK_TELEMETRY] useThreads.loadThreads:start', {
        userId,
        isLoadMore,
        offset: currentOffset,
        prevCount: threads.length,
      });
      const data = await fetchThreadsFn(userId, { limit: 20, offset: currentOffset });
      
      setThreads(currentThreads => {
        const isGeneric = (title?: string) => {
          if (!title) return true;
          const t = String(title).trim().toLowerCase();
          return t === 'new conversation' || t.length === 0;
        };

        if (isLoadMore) {
          // For load more, just append new threads (preserves ordering)
          return [...currentThreads, ...data.threads];
        } else {
          // For initial/refresh load, preserve client ordering but apply server ordering for new sessions
          if (currentThreads.length === 0) {
            // First load: use server ordering
            return data.threads;
          } else {
            // Subsequent refresh: preserve client ordering, update data only
            const localById = new Map(currentThreads.map(t => [t.id, t] as const));
            const serverById = new Map(data.threads.map((t: Thread) => [t.id, t] as const));
            
            // Update existing threads in place (preserve order)
            const updatedThreads = currentThreads.map(localThread => {
              const serverThread = serverById.get(localThread.id) as Thread | undefined;
              if (!serverThread) {
                // Thread exists locally but not on server (optimistic thread)
                return localThread;
              }
              
              // Merge local and server data, preserving non-generic titles
              const preferredTitle = !isGeneric(localThread.title) && 
                (isGeneric(serverThread.title) || (localThread.title?.length || 0) >= (serverThread.title?.length || 0))
                ? localThread.title
                : serverThread.title;
              
              return {
                id: serverThread.id,
                title: preferredTitle,
                messageCount: Math.max(localThread.messageCount || 0, serverThread.messageCount || 0),
                lastMessageAt: new Date(Math.max(new Date(localThread.lastMessageAt).getTime(), new Date(serverThread.lastMessageAt).getTime())),
                createdAt: new Date(Math.min(new Date(localThread.createdAt).getTime(), new Date(serverThread.createdAt).getTime())),
                updatedAt: new Date(Math.max(new Date(localThread.updatedAt).getTime(), new Date(serverThread.updatedAt).getTime())),
                hasNewMessages: Boolean(localThread.hasNewMessages || serverThread.hasNewMessages),
              } as Thread;
            });

            // Add any new threads from server that don't exist locally (append to end)
            const localIds = new Set(currentThreads.map(t => t.id));
            const newServerThreads = data.threads.filter((t: Thread) => !localIds.has(t.id));
            
            const finalThreads = [...updatedThreads, ...newServerThreads];

            // Cache the threads data
            if (typeof window !== "undefined") {
              try {
                sessionStorage.setItem(cacheKey, JSON.stringify(finalThreads));
              } catch (err) {
                console.warn("[useThreads] Failed to cache threads:", err);
              }
            }

            console.log('[AK_TELEMETRY] useThreads.loadThreads:orderPreserved', {
              isFirstLoad: currentThreads.length === 0,
              originalOrder: currentThreads.map(t => t.id).slice(0, 3),
              finalOrder: finalThreads.map(t => t.id).slice(0, 3),
              newThreadsAdded: newServerThreads.length,
            });

            return finalThreads;
          }
        }
      });
      
      if (isLoadMore) {
        setOffset(prev => prev + data.threads.length);
      } else {
        setOffset(data.threads.length);
      }
      
      setHasMore(data.hasMore);
      console.log('[AK_TELEMETRY] useThreads.loadThreads:success', {
        userId,
        isLoadMore,
        fetched: data.threads.length,
        hasMore: data.hasMore,
        newCount: threads.length, // Read from state after update
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load threads';
      setError(errorMessage);
      console.error('[useThreads] Error loading threads:', err);
      console.log('[AK_TELEMETRY] useThreads.loadThreads:error', {
        userId,
        isLoadMore,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
      console.log('[AK_TELEMETRY] useThreads.loadThreads:complete', {
        userId,
        isLoadMore,
        finalCount: threads.length,
      });
    }
  }, [userId, offset, fetchThreadsFn, cacheKey]);

  const loadMore = useCallback(async () => {
    console.log('[AK_TELEMETRY] useThreads.loadMore:trigger', { hasMore, loading });
    if (!hasMore || loading) return;
    await loadThreads(true);
  }, [hasMore, loading, loadThreads]);

  const refresh = useCallback(async () => {
    console.log('[AK_TELEMETRY] useThreads.refresh:start');
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
    console.log('[AK_TELEMETRY] useThreads.addOptimisticThread:start', { threadId, title });
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
        console.log('[AK_TELEMETRY] useThreads.addOptimisticThread:duplicate', { threadId });
        return prev;
      }
      const updatedThreads = [newThread, ...prev];
      
      // Update cache
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(updatedThreads));
        } catch (err) {
          console.warn('[useThreads] Failed to update cache after adding optimistic thread:', err);
        }
      }
      
      console.log('[AK_TELEMETRY] useThreads.addOptimisticThread:applied', { threadId, newCount: updatedThreads.length });
      return updatedThreads;
    });
  }, [cacheKey]);

  const deleteThread = useCallback(async (threadId: string) => {
    try {
      console.log('[AK_TELEMETRY] useThreads.deleteThread:start', { threadId, currentThreadId });
      // Optimistically remove from UI
      const updatedThreads = threads.filter(t => t.id !== threadId);
      setThreads(updatedThreads);
      
      // Update cache
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(updatedThreads));
        } catch (err) {
          console.warn('[useThreads] Failed to update cache after delete:', err);
        }
      }
      
      // If we're deleting the current thread, clear current thread
      if (currentThreadId === threadId) {
        setCurrentThreadId(null);
        console.log('[AK_TELEMETRY] useThreads.deleteThread:clearedCurrent', { threadId });
      }

      await deleteThreadFn(threadId);
      console.log('[AK_TELEMETRY] useThreads.deleteThread:success', { threadId, newCount: updatedThreads.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete thread';
      setError(errorMessage);
      console.error('Error deleting thread:', err);
      
      // Restore thread on error by refreshing
      await refresh();
      console.log('[AK_TELEMETRY] useThreads.deleteThread:error', { threadId, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }, [currentThreadId, refresh, deleteThreadFn, threads, cacheKey]);

  // NEW: Load thread history method
  const loadThreadHistory = useCallback(async (threadId: string): Promise<any[]> => {
    return fetchHistoryFn(threadId);
  }, [fetchHistoryFn]);

  // Background refresh - silently update data without showing loading state
  // Preserves any optimistic threads that aren't yet on the server
  const backgroundRefresh = useCallback(async () => {
    try {
      console.log('[AK_TELEMETRY] useThreads.backgroundRefresh:start', {
        userId,
      });
      const data = await fetchThreadsFn(userId, { limit: 20, offset: 0 });

      setThreads(currentThreads => {
        const isGeneric = (title?: string) => {
          if (!title) return true;
          const t = String(title).trim().toLowerCase();
          return t === 'new conversation' || t.length === 0;
        };

        // Create lookup maps for efficient merging
        const localById = new Map(currentThreads.map(t => [t.id, t] as const));
        const serverById = new Map(data.threads.map((t: Thread) => [t.id, t] as const));
        
        // PRESERVE CLIENT ORDERING: Update existing threads in place, maintain current order
        const updatedThreads = currentThreads.map(localThread => {
          const serverThread = serverById.get(localThread.id) as Thread | undefined;
          if (!serverThread) {
            // Thread exists locally but not on server (optimistic thread)
            return localThread;
          }
          
          // Merge local and server data, preserving non-generic titles
          const preferredTitle = !isGeneric(localThread.title) && 
            (isGeneric(serverThread.title) || (localThread.title?.length || 0) >= (serverThread.title?.length || 0))
            ? localThread.title
            : serverThread.title;
          
          return {
            id: serverThread.id,
            title: preferredTitle,
            messageCount: Math.max(localThread.messageCount || 0, serverThread.messageCount || 0),
            lastMessageAt: new Date(Math.max(new Date(localThread.lastMessageAt).getTime(), new Date(serverThread.lastMessageAt).getTime())),
            createdAt: new Date(Math.min(new Date(localThread.createdAt).getTime(), new Date(serverThread.createdAt).getTime())),
            updatedAt: new Date(Math.max(new Date(localThread.updatedAt).getTime(), new Date(serverThread.updatedAt).getTime())),
            hasNewMessages: Boolean(localThread.hasNewMessages || serverThread.hasNewMessages),
          } as Thread;
        });

        // Add any new threads from server that don't exist locally
        // These will be appended to the end to maintain stable ordering
        const localIds = new Set(currentThreads.map(t => t.id));
        const newServerThreads = data.threads.filter((t: Thread) => !localIds.has(t.id));
        
        const finalThreads = [...updatedThreads, ...newServerThreads];

        // Update cache with merged data (preserving order)
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(finalThreads));
          } catch (err) {
            console.warn(
              '[useThreads] Failed to cache threads during background refresh:',
              err
            );
          }
        }

        console.log('[AK_TELEMETRY] useThreads.backgroundRefresh:orderPreserved', {
          originalOrder: currentThreads.map(t => t.id).slice(0, 3),
          finalOrder: finalThreads.map(t => t.id).slice(0, 3),
          newThreadsAdded: newServerThreads.length,
        });

        return finalThreads;
      });

      setOffset(data.threads.length);
      setHasMore(data.hasMore);

      console.log('[AK_TELEMETRY] useThreads.backgroundRefresh:success', {
        userId,
        fetched: data.threads.length,
        hasMore: data.hasMore,
      });
    } catch (err) {
      // Silently fail background refreshes - don't show error to user
      console.warn('[useThreads] Background refresh failed:', err);
      console.log('[AK_TELEMETRY] useThreads.backgroundRefresh:error', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }, [userId, fetchThreadsFn, cacheKey]);

  // Hydration effect - load from cache after component mounts
  useEffect(() => {
    if (typeof window !== 'undefined' && !isHydrated) {
      setIsHydrated(true);
      console.log('[AK_TELEMETRY] useThreads.hydrate:start', { userId });
      
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Convert date strings back to Date objects
          const cachedThreads = parsed.map((thread: any) => ({
            ...thread,
            lastMessageAt: new Date(thread.lastMessageAt),
            createdAt: new Date(thread.createdAt),
            updatedAt: new Date(thread.updatedAt),
          }));
          
          setThreads(cachedThreads);
          setLoading(false); // Don't show loading if we have cache

          // Schedule background refresh (delayed to allow optimistic updates to persist)
          setTimeout(() => {
            backgroundRefresh();
          }, 2000);

          console.log('[AK_TELEMETRY] useThreads.hydrate:fromCache', {
            count: cachedThreads.length,
          });
          return; // Exit early if we loaded from cache
        }
      } catch (err) {
        console.warn('[useThreads] Failed to parse cached threads:', err);
      }
      
      // No cache found, proceed with normal loading
      console.log('[AK_TELEMETRY] useThreads.hydrate:noCache');
      loadThreads(false);
    }
  }, [isHydrated, cacheKey, backgroundRefresh, loadThreads]);

  // Initial load - only when userId changes and we're hydrated
  useEffect(() => {
    if (isHydrated && threads.length === 0 && !loading) {
      loadThreads(false);
    }
  }, [userId, isHydrated]); // Intentionally NOT including loadThreads to prevent loop



  // Cache management function
  const clearCache = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(cacheKey);
        console.log('[AK_TELEMETRY] useThreads.clearCache:success', { userId });
      } catch (err) {
        console.warn('[useThreads] Failed to clear cache:', err);
        console.log('[AK_TELEMETRY] useThreads.clearCache:error', { userId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }, [cacheKey]);

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
    clearCache,
  };
}



