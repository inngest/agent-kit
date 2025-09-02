"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { type AgentTransport } from '../transport/transport.js';
import { 
  useOptionalGlobalTransport, 
  useOptionalGlobalUserId, 
  useOptionalGlobalChannelKey 
} from '../components/AgentProvider.js';
import { type Thread, createDebugLogger } from '../types/index.js';

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
  userId?: string; // Optional: inherits from AgentProvider if not provided
  channelKey?: string; // Optional: inherits from AgentProvider if not provided
  debug?: boolean; // Optional: enable debug logging
  // Custom transport instance (overrides global transport)
  transport?: AgentTransport;
  // Custom fetch functions for flexibility (overrides transport and global transport)
  fetchThreads?: (userId: string, pagination: { limit: number; offset: number }) => Promise<{
    threads: Thread[];
    hasMore: boolean;
    total: number;
  }>;
  fetchHistory?: (threadId: string) => Promise<any[]>;
  createThread?: (userId: string) => Promise<{ threadId: string; title: string }>;
  deleteThread?: (threadId: string) => Promise<void>;
  renameThread?: (threadId: string, title: string) => Promise<void>;
}): UseThreadsReturn {
  // Inherit from provider if available
  const globalUserId = useOptionalGlobalUserId();
  const globalChannelKey = useOptionalGlobalChannelKey();
  
  // Resolve configuration with provider inheritance
  const userId = config?.userId || globalUserId;
  const channelKey = config?.channelKey || globalChannelKey || undefined;
  
  // Validate that we have a userId for thread management
  if (!userId) {
    throw new Error(
      'useThreads requires a userId either via config prop or AgentProvider. ' +
      'Pass userId to useThreads() or wrap your component with <AgentProvider userId="...">'
    );
  }
  
  // Transport resolution with provider inheritance (provider is optional)
  const providerTransport = useOptionalGlobalTransport();
  const transport = useMemo(() => {
    // Priority 1: Hook-level transport override
    if (config?.transport) {
      return config.transport;
    }
    
    // Priority 2: Inherit from provider (if available)
    if (providerTransport) {
      return providerTransport;
    }
    
    // Priority 3: No transport - hooks will use fallback fetch calls
    return null;
  }, [config?.transport, providerTransport]);
  
  // Create debug logger
  const logger = useMemo(() => createDebugLogger('useThreads', config?.debug ?? false), [config?.debug]);
  
  // Instance tracking for telemetry
  const [instanceId] = useState(() => Math.random().toString(36).substr(2, 8));
  logger.log('useThreads.instance', { instanceId, userId });
  
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

  // Stable default fetch functions using useCallback with transport integration
  const fetchThreadsDefault = useCallback(async (userId: string, pagination: { limit: number; offset: number }) => {
    if (transport) {
      // Use transport method with channelKey support
      return transport.fetchThreads({ 
        userId, 
        channelKey: channelKey || undefined, // Convert null to undefined
        limit: pagination.limit, 
        offset: pagination.offset 
      });
    }
    
    // Fallback to direct fetch if no transport available
    const queryParams = new URLSearchParams({
      userId,
      limit: pagination.limit.toString(),
      offset: pagination.offset.toString(),
    });
    
    // Add channelKey if available
    if (channelKey) {
      queryParams.set('channelKey', channelKey);
    }
    
    const response = await fetch(`/api/threads?${queryParams}`);
          if (!response.ok) {
        logger.error(`Failed to load threads:`, { status: response.status });
        throw new Error('Failed to load threads');
      }
    return response.json();
  }, [transport, channelKey]);

  const fetchHistoryDefault = useCallback(async (threadId: string) => {
    if (transport) {
      // Use transport method
      return transport.fetchHistory({ threadId });
    }
    
    // Fallback to direct fetch if no transport available
    const response = await fetch(`/api/threads/${threadId}`);
          if (!response.ok) {
        logger.error(`Failed to load thread history:`, { threadId, status: response.status });
        throw new Error('Failed to load thread history');
      }
    const data = await response.json();
    return data.messages;
  }, [transport]);

  const createThreadDefault = useCallback(async (userId: string) => {
    if (transport) {
      // Use transport method with channelKey support
      return transport.createThread({ userId, channelKey: channelKey || undefined });
    }
    
    // Fallback to direct fetch if no transport available
    const body: any = { userId };
    if (channelKey) {
      body.channelKey = channelKey;
    }
    
    const response = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
          if (!response.ok) {
        logger.error(`Failed to create thread:`, { status: response.status });
        throw new Error('Failed to create thread');
      }
    return response.json();
  }, [transport, channelKey]);

  const deleteThreadDefault = useCallback(async (threadId: string) => {
    if (transport) {
      // Use transport method
      return transport.deleteThread({ threadId });
    }
    
    // Fallback to direct fetch if no transport available
    const response = await fetch(`/api/threads/${threadId}`, { method: 'DELETE' });
          if (!response.ok) {
        logger.error(`Failed to delete thread:`, { threadId, status: response.status });
        throw new Error('Failed to delete thread');
      }
  }, [transport]);

  // Use provided functions or stable defaults
  const fetchThreadsFn = config?.fetchThreads || fetchThreadsDefault;
  const fetchHistoryFn = config?.fetchHistory || fetchHistoryDefault;
  const createThreadFn = config?.createThread || createThreadDefault;
  const deleteThreadFn = config?.deleteThread || deleteThreadDefault;

  const loadThreads = useCallback(async (isLoadMore = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const currentOffset = isLoadMore ? offset : 0;
      logger.log('loadThreads:start', {
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
                logger.warn("Failed to cache threads:", err);
              }
            }

            logger.log('loadThreads:orderPreserved', {
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
      logger.log('loadThreads:success', {
        userId,
        isLoadMore,
        fetched: data.threads.length,
        hasMore: data.hasMore,
        newCount: threads.length, // Read from state after update
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load threads';
      setError(errorMessage);
      logger.error('Error loading threads:', err);
      logger.log('loadThreads:error', {
        userId,
        isLoadMore,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
      logger.log('loadThreads:complete', {
        userId,
        isLoadMore,
        finalCount: threads.length,
      });
    }
  }, [userId, offset, fetchThreadsFn, cacheKey]);

  const loadMore = useCallback(async () => {
    logger.log('loadMore:trigger', { hasMore, loading });
    if (!hasMore || loading) return;
    await loadThreads(true);
  }, [hasMore, loading, loadThreads]);

  const refresh = useCallback(async () => {
    logger.log('refresh:start');
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
      logger.error('Error creating thread:', err);
      throw err;
    }
  }, [userId, createThreadFn]);

  const addOptimisticThread = useCallback((threadId: string, title: string) => {
    logger.log('addOptimisticThread:start', { threadId, title });
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
        logger.log('addOptimisticThread:duplicate', { threadId });
        return prev;
      }
      const updatedThreads = [newThread, ...prev];
      
      // Update cache
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(updatedThreads));
        } catch (err) {
          logger.warn('Failed to update cache after adding optimistic thread:', err);
        }
      }
      
      logger.log('addOptimisticThread:applied', { threadId, newCount: updatedThreads.length });
      return updatedThreads;
    });
  }, [cacheKey]);

  const deleteThread = useCallback(async (threadId: string) => {
    try {
      logger.log('deleteThread:start', { threadId, currentThreadId });
      // Optimistically remove from UI
      const updatedThreads = threads.filter(t => t.id !== threadId);
      setThreads(updatedThreads);
      
      // Update cache
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(updatedThreads));
        } catch (err) {
          logger.warn('Failed to update cache after delete:', err);
        }
      }
      
      // If we're deleting the current thread, clear current thread
      if (currentThreadId === threadId) {
        setCurrentThreadId(null);
        logger.log('deleteThread:clearedCurrent', { threadId });
      }

      await deleteThreadFn(threadId);
      logger.log('deleteThread:success', { threadId, newCount: updatedThreads.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete thread';
      setError(errorMessage);
      logger.error('Error deleting thread:', err);
      
      // Restore thread on error by refreshing
      await refresh();
      logger.log('deleteThread:error', { threadId, error: err instanceof Error ? err.message : String(err) });
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
      logger.log('backgroundRefresh:start', {
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
            logger.warn(
              'Failed to cache threads during background refresh:',
              err
            );
          }
        }

        logger.log('backgroundRefresh:orderPreserved', {
          originalOrder: currentThreads.map(t => t.id).slice(0, 3),
          finalOrder: finalThreads.map(t => t.id).slice(0, 3),
          newThreadsAdded: newServerThreads.length,
        });

        return finalThreads;
      });

      setOffset(data.threads.length);
      setHasMore(data.hasMore);

      logger.log('backgroundRefresh:success', {
        userId,
        fetched: data.threads.length,
        hasMore: data.hasMore,
      });
    } catch (err) {
      // Silently fail background refreshes - don't show error to user
      logger.warn('Background refresh failed:', err);
      logger.log('backgroundRefresh:error', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }, [userId, fetchThreadsFn, cacheKey]);

  // Hydration effect - load from cache after component mounts
  useEffect(() => {
    if (typeof window !== 'undefined' && !isHydrated) {
      setIsHydrated(true);
      logger.log('hydrate:start', { userId });
      
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

          logger.log('hydrate:fromCache', {
            count: cachedThreads.length,
          });
          return; // Exit early if we loaded from cache
        }
      } catch (err) {
        logger.warn('Failed to parse cached threads:', err);
      }
      
      // No cache found, proceed with normal loading
      logger.log('hydrate:noCache');
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
        logger.log('clearCache:success', { userId });
      } catch (err) {
        logger.warn('Failed to clear cache:', err);
        logger.log('clearCache:error', { userId, error: err instanceof Error ? err.message : String(err) });
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



