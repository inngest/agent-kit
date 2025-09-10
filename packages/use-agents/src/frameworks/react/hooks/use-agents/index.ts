"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { v4 as uuidv4 } from "uuid";
import { useProviderContext, resolveIdentity, resolveTransport } from "./provider-context.js";
import { AgentsEvents } from "./logging-events.js";
import { reduceStreamingState } from "../../../../core/index.js";
import { DEFAULT_THREAD_PAGE_SIZE } from "../../../../core/domain/constants.js";
import { StreamingEngine, ThreadManager } from "../../../../core/index.js";
import { mapToNetworkEvent, shouldProcessEvent } from "../../../../core/services/event-mapper.js";
import { getError } from "../../../../core/domain/errors.js";
import { useConnectionSubscription } from "../use-connection.js";
import {
  createDebugLogger,
  type ConversationMessage,
  type Thread,
} from "../../../../types/index.js";
import type { UseAgentsConfig, UseAgentsReturn } from "./types.js";
import { formatMessagesToAgentKitHistory } from "../../../../utils/message-formatting.js";
import { createDefaultHttpTransport } from "../../../../core/adapters/http-transport.js";
// mergeThreadsPreserveOrder now lives in core ThreadManager; use instance method instead

export function useAgents(config: UseAgentsConfig = {}): UseAgentsReturn {
  const logger = useMemo(
    () => createDebugLogger("useAgents", config?.debug ?? false),
    [config?.debug]
  );

  // Correlation IDs for debugging
  const renderSessionIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const threadSessionIdRef = useRef<number>(0);

  const provider = useProviderContext();
  if (config.debug) {
    logger.log(AgentsEvents.ProviderIdentityResolved, {
      userId: provider.userId,
      resolvedChannelKey: provider.resolvedChannelKey,
      renderSessionId: renderSessionIdRef.current,
    });
  }
  const { userId, channelKey } = resolveIdentity({
    configUserId: config.userId,
    configChannelKey: config.channelKey,
    provider,
  });
  const transport = resolveTransport(null, provider);
  const effectiveChannel = provider.resolvedChannelKey || channelKey || userId || null;

  // Establish effective transport (provider or default HTTP)
  const effectiveTransport = useMemo(() => {
    return transport ?? createDefaultHttpTransport();
  }, [transport]);

  // Local engine for realtime + local state
  const engineRef = useRef<StreamingEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new StreamingEngine({
      initialState: {
        threads: {},
        currentThreadId: "",
        lastProcessedIndex: 0,
        isConnected: false,
      } as any,
      debug: Boolean(config.debug),
    });
  }
  const subscribe = useCallback((fn: () => void) => engineRef.current!.subscribe(fn), []);
  const getSnapshot = useCallback(() => engineRef.current!.getState(), []);
  const lastConnectedRef = useRef<boolean | null>(null);

  // Provide a stable fallback thread ID when none is selected yet
  const fallbackThreadIdRef = useRef<string | null>(null);
  if (fallbackThreadIdRef.current === null) {
    fallbackThreadIdRef.current = uuidv4();
  }

  // === Internal thread state (consolidated) ===
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState<boolean>(true);
  const [threadsHasMore, setThreadsHasMore] = useState<boolean>(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadIdState] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);

  const threadManagerRef = useRef<ThreadManager | null>(null);
  if (!threadManagerRef.current) threadManagerRef.current = new ThreadManager();

  const fetchThreadsFn = useMemo(
    () => (config.fetchThreads as any) || (async (uid: string, pagination: any) => {
      return effectiveTransport.fetchThreads({
        userId: uid,
        channelKey: channelKey || undefined,
        limit: pagination.limit,
        offset: pagination.offset ?? 0,
        cursorTimestamp: pagination.cursorTimestamp,
        cursorId: pagination.cursorId,
      } as any);
    }),
    [config.fetchThreads, effectiveTransport, channelKey]
  );
  const fetchHistoryFn = useMemo(
    () => (config.fetchHistory as any) || (async (tid: string) => {
      return effectiveTransport.fetchHistory({ threadId: tid });
    }),
    [config.fetchHistory, effectiveTransport]
  );
  const createThreadFn = useMemo(
    () => (config.createThread as any) || (async (uid: string) => {
      return effectiveTransport.createThread({ userId: uid, channelKey: channelKey || undefined });
    }),
    [config.createThread, effectiveTransport, channelKey]
  );
  const deleteThreadFn = useMemo(
    () => (config.deleteThread as any) || (async (tid: string) => {
      return effectiveTransport.deleteThread({ threadId: tid });
    }),
    [config.deleteThread, effectiveTransport]
  );

  const loadThreads = useCallback(
    async (isLoadMore = false) => {
      if (!userId && !channelKey) return;
      try {
        setThreadsLoading(true);
        setThreadsError(null);
        const pagination = { limit: DEFAULT_THREAD_PAGE_SIZE, offset: isLoadMore ? offset : 0 } as any;
        const data = await fetchThreadsFn(userId as string, pagination);
        setThreads((prev) => {
          const tm = threadManagerRef.current!;
          return isLoadMore ? tm.mergeThreadsPreserveOrder(prev, data.threads) : data.threads;
        });
        if (isLoadMore) {
          setOffset((prev) => prev + (data.threads?.length || 0));
        } else {
          setOffset(data.threads?.length || 0);
        }
        setThreadsHasMore(Boolean(data.hasMore));
      } catch (err) {
        setThreadsError(err instanceof Error ? err.message : String(err));
      } finally {
        setThreadsLoading(false);
      }
    },
    [userId, channelKey, offset, fetchThreadsFn]
  );

  useEffect(() => {
    // Initial load when identity resolves
    void loadThreads(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, channelKey]);

  // Derive status from engine state if enabled
  const engineState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const engineStatus = useMemo(() => {
    if (!engineState) return null;
    const s = engineState as any;
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    const ts = s?.threads?.[tid];
    return (ts?.agentStatus as string) || null;
  }, [currentThreadId, engineState]);

  // Derive messages from engine state if enabled
  const engineMessages = useMemo<ConversationMessage[] | null>(() => {
    if (!engineState) return null;
    const s = engineState as any;
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    const ts = s?.threads?.[tid];
    if (config.debug) {
      const count = Array.isArray(ts?.messages) ? ts.messages.length : 0;
      logger.log(AgentsEvents.SelectorReadMessages, {
        threadIdUsed: tid,
        count,
        historyLoaded: Boolean(ts?.historyLoaded),
        currentThreadIdAtRead: currentThreadId,
        renderSessionId: renderSessionIdRef.current,
      });
    }
    return (ts?.messages as ConversationMessage[]) || null;
  }, [currentThreadId, engineState]);

  const currentThreadHistoryLoaded = useMemo(() => {
    const s = engineState as any;
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    return Boolean(s?.threads?.[tid]?.historyLoaded);
  }, [engineState, currentThreadId]);

  // Diagnostics: capture initial-loading derivation and fallback usage
  useEffect(() => {
    if (!config.debug) return;
    try {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      const hasRealThread = Boolean(config.initialThreadId || currentThreadId);
      const s = engineRef.current?.getState() as any;
      const historyLoadedForTid = Boolean(s?.threads?.[tid]?.historyLoaded);
      const refLoading = isLoadingInitialThreadRef.current;
      const computedIsLoading = Boolean(hasRealThread && !historyLoadedForTid);
      logger.log('[diag:init-load]', {
        hasRealThread,
        tidUsed: tid,
        isFallback: tid === fallbackThreadIdRef.current!,
        historyLoadedForTid,
        refLoading,
        computedIsLoading,
      });
    } catch {}
  }, [config.debug, currentThreadId, engineState, currentThreadHistoryLoaded, logger]);

  // Derive hasNewMessages flags for threads from engine state
  const threadsWithFlags = useMemo(() => {
    const s = engineState as any;
    if (!s || !s.threads) return threads;
    return (threads || []).map((t) => {
      const ts = s.threads?.[t.id];
      return ts?.hasNewMessages ? ({ ...t, hasNewMessages: true } as Thread) : t;
    });
  }, [threads, engineState]);

  useConnectionSubscription({
    connection: provider.connection,
    channel: effectiveChannel,
    userId,
    threadId: currentThreadId,
    debug: Boolean(config.debug),
    refreshToken: (transport ?? effectiveTransport)
      ? async () => {
          const tid = currentThreadId || fallbackThreadIdRef.current!;
          return await ((transport ?? effectiveTransport) as any).getRealtimeToken({
            userId,
            threadId: tid,
            channelKey: effectiveChannel || userId,
          });
        }
      : undefined,
    onMessage: useCallback((chunk: unknown) => {
      logger.log("[realtime:message]", chunk);
      const evt = mapToNetworkEvent(chunk);
      if (!evt) return;
      // Process all events for this user/channel; reducer routes by evt.data.threadId
      if (!shouldProcessEvent(evt as any, { userId })) return;
      if (!engineRef.current) {
        engineRef.current = new StreamingEngine({
          initialState: {
            threads: {},
            currentThreadId: currentThreadId || fallbackThreadIdRef.current!,
            lastProcessedIndex: 0,
            isConnected: true,
          } as any,
          debug: Boolean(config.debug),
        });
      }
      engineRef.current.handleRealtimeMessages([evt]);
      // Ephemeral mode: persist updated thread messages to sessionStorage for resumable streams
      try {
        if (config.enableThreadValidation === false && typeof window !== "undefined") {
          const tid = (evt as any)?.data?.threadId || currentThreadId || fallbackThreadIdRef.current!;
          const s = engineRef.current.getState() as any;
          const msgs = s?.threads?.[tid]?.messages || [];
          const keyUser = userId || "anon";
          const key = `ephemeral_messages_${keyUser}_${tid}`;
          window.sessionStorage?.setItem(key, JSON.stringify(msgs));
        }
      } catch {}
    }, [logger, userId, currentThreadId, config.debug]),
    onStateChange: useCallback((state: unknown) => {
      logger.log("[realtime:state]", state);
      try {
        // Only trigger re-render when connected flag actually changes
        engineRef.current?.dispatch({ type: "CONNECTION_STATE_CHANGED", state } as any);
        const connected = String(state) === 'Active';
        if (lastConnectedRef.current !== connected) {
          lastConnectedRef.current = connected;
        }
      } catch {}
    }, [logger]),
  });

  // Utility getters
  const getThreadState = useCallback((tid: string) => {
    const s = engineRef.current?.getState() as any;
    return s?.threads?.[tid] as any;
  }, []);

  // Initial route-based thread load
  const isLoadingInitialThreadRef = useRef(false);
  const lastInitialIdRef = useRef<string | null>(null);
  // One-shot domain-aware revalidation tracker
  const revalidatedOnceRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const targetId = config.initialThreadId;
    if (!targetId) return;
    if (lastInitialIdRef.current === targetId) return;
    lastInitialIdRef.current = targetId;

    isLoadingInitialThreadRef.current = true;
    switchToThread(targetId)
      .catch((err) => logger.error("Failed to load initial thread:", err))
      .finally(() => {
        isLoadingInitialThreadRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.initialThreadId]);

  const loadThreadHistory = useCallback(
    async (threadId: string): Promise<ConversationMessage[]> => {
      try {
        const t0 = Date.now();
        const requestId = `${threadId}-${t0}`;
        logger.log(AgentsEvents.HistoryFetchStart, { threadId, requestId, currentThreadIdAtStart: currentThreadId, renderSessionId: renderSessionIdRef.current });
        const dbMessages: any[] = await fetchHistoryFn(threadId);
        const formatted = threadManagerRef.current!.formatRawHistoryMessages(dbMessages);
        const dt = Date.now() - t0;
        logger.log(AgentsEvents.HistoryFetchEnd, { threadId, requestId, ms: dt, count: formatted.length, currentThreadIdAtEnd: currentThreadId });
        if (formatted.length === 0) {
          logger.log(AgentsEvents.HistoryFetchEmpty, { threadId, requestId, ms: dt });
        }
        return formatted;
      } catch (err) {
        logger.error("loadThreadHistory failed:", err);
        return [];
      }
    },
    [fetchHistoryFn, logger]
  );

  // Ephemeral hydration: when validation is disabled, hydrate current thread from sessionStorage
  useEffect(() => {
    if (config.enableThreadValidation !== false) return;
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    if (typeof window === "undefined" || !tid) return;
    try {
      const keyUser = userId || "anon";
      const key = `ephemeral_messages_${keyUser}_${tid}`;
      logger.log(AgentsEvents.HydrateSessionStart, { threadId: tid, key });
      const raw = window.sessionStorage?.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Only hydrate if engine has no messages to avoid flicker
        const s = engineRef.current?.getState() as any;
        const existing = s?.threads?.[tid]?.messages || [];
        if (existing.length === 0) {
          try { engineRef.current?.dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId: tid, messages: parsed } as any); } catch {}
          logger.log(AgentsEvents.HydrateSessionEnd, { threadId: tid, storedCount: parsed.length });
        }
      }
    } catch {}
  }, [config.enableThreadValidation, currentThreadId, userId]);

  // Domain-aware revalidation: if selected thread claims messages but engine has none, refetch once
  useEffect(() => {
    const tid = currentThreadId || null;
    if (!tid) return;
    const selected = threads.find((t) => t.id === tid);
    const msgs = (engineMessages as ConversationMessage[] | null) || [];
    if (!selected) return;
    if (selected.messageCount > 0 && msgs.length === 0 && !revalidatedOnceRef.current.has(tid)) {
      revalidatedOnceRef.current.add(tid);
      if (config.debug) logger.log("[revalidate] missing history despite messageCount>0; refetching", { tid, messageCount: selected.messageCount });
      const handle = setTimeout(async () => {
        try {
          const history = await loadThreadHistory(tid);
          const current = engineRef.current?.getState()?.currentThreadId;
          if (current !== tid) return;
          try { engineRef.current?.dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId: tid, messages: history } as any); } catch {}
        } catch (err) {
          if (config.debug) logger.warn("[revalidate] history refetch failed", err);
        }
      }, 400);
      return () => clearTimeout(handle);
    }
  }, [currentThreadId, threads, engineMessages, loadThreadHistory, logger, config.debug]);

  // Actions
  const setCurrentThreadId = useCallback(
    (threadId: string) => {
      try { engineRef.current?.dispatch({ type: 'SET_CURRENT_THREAD', threadId } as any); } catch {}
      setCurrentThreadIdState(threadId);
      logger.log("setCurrentThreadId", { threadId });
    },
    [logger]
  );

  const switchToThread = useCallback(
    async (threadId: string) => {
      // Immediate switch for responsive UX
      setCurrentThreadId(threadId);
      threadSessionIdRef.current++;
      // Clear unread badge for this thread
      try { engineRef.current?.dispatch({ type: 'MARK_THREAD_VIEWED', threadId } as any); } catch {}

      // Optionally validate/load history when transport is available
      try {
        if (config.enableThreadValidation !== false) {
          const history = await loadThreadHistory(threadId);
          try { engineRef.current?.dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId, messages: history } as any); } catch {}
          logger.log(AgentsEvents.EngineReplaceMessages, { threadId, source: 'fetch', count: history?.length || 0, currentThreadIdAtApply: engineRef.current?.getState()?.currentThreadId, renderSessionId: renderSessionIdRef.current });

          // One-shot unconditional revalidation: if initial fetch was empty, refetch once shortly after
          if (Array.isArray(history) && history.length === 0) {
            logger.log(AgentsEvents.HistoryRetryStart, { threadId, renderSessionId: renderSessionIdRef.current });
            setTimeout(async () => {
              try {
                const retry = await loadThreadHistory(threadId);
                const current = engineRef.current?.getState()?.currentThreadId;
                if (current !== threadId) return;
                if (Array.isArray(retry) && retry.length > 0) {
                  try { engineRef.current?.dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId, messages: retry } as any); } catch {}
                  logger.log(AgentsEvents.HistoryRetryEnd, { threadId, count: retry.length, currentThreadIdAtApply: current, renderSessionId: renderSessionIdRef.current });
                }
              } catch (e) {
                if (config.debug) logger.warn('[revalidate:retry] history refetch failed', e);
              }
            }, 450);
          }
        }
      } catch (err) {
        logger.warn("switchToThread validation/load failed", err);
        config.onThreadNotFound?.(threadId);
      }
    },
    [setCurrentThreadId, loadThreadHistory, config, logger]
  );

  const createNewThread = useCallback(() => {
    const id = uuidv4();
    try { engineRef.current?.dispatch({ type: 'CREATE_THREAD', threadId: id } as any); } catch {}
    setCurrentThreadIdState(id);
    logger.log("createNewThread", { id });
    return id;
  }, [logger]);

  const sendMessageToThread = useCallback(
    async (threadId: string | null, message: string, options?: { messageId?: string; state?: Record<string, unknown> | (() => Record<string, unknown>) }) => {
      if (!effectiveTransport) return;
      const tid = threadId || fallbackThreadIdRef.current!;
      const messageId = options?.messageId ?? uuidv4();
      const clientState = options?.state
        ? (typeof options.state === 'function' ? (options.state as any)() : options.state)
        : (typeof config.state === 'function' ? config.state() : undefined);

      // optimistic user message
      try {
        engineRef.current?.dispatch({ type: 'MESSAGE_SENT', threadId: tid, message, messageId, clientState } as any);
      } catch {}

      const msgs = (getThreadState(tid)?.messages || []) as ConversationMessage[];
      const history = formatMessagesToAgentKitHistory(msgs);
      try {
        await effectiveTransport.sendMessage({
          userMessage: {
            id: messageId,
            content: message,
            role: 'user',
            state: clientState,
            clientTimestamp: new Date(),
          },
          threadId: tid,
          history,
          userId,
          channelKey: channelKey,
        } as any);
        try { engineRef.current?.dispatch({ type: 'MESSAGE_SEND_SUCCESS', threadId: tid, messageId } as any); } catch {}
      } catch (err) {
        try { engineRef.current?.dispatch({ type: 'MESSAGE_SEND_FAILED', threadId: tid, messageId, error: (err instanceof Error ? err.message : String(err)) } as any); } catch {}
        throw err;
      }
    },
    [effectiveTransport, userId, channelKey, config.state, getThreadState, fetchHistoryFn]
  );

  const sendMessage = useCallback(
    async (message: string, options?: { messageId?: string }) => {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      logger.log("sendMessage:start", { threadId: tid });
      await sendMessageToThread(tid, message, { messageId: options?.messageId });
    },
    [currentThreadId, sendMessageToThread, logger]
  );

  const approveToolCall = useCallback(
    async (toolCallId: string, reason?: string) => {
      if (!effectiveTransport) return;
      await effectiveTransport.approveToolCall({
        toolCallId,
        threadId: (currentThreadId as string)!,
        action: "approve",
        reason,
      });
    },
    [effectiveTransport, currentThreadId]
  );

  const denyToolCall = useCallback(
    async (toolCallId: string, reason?: string) => {
      if (!effectiveTransport) return;
      await effectiveTransport.approveToolCall({
        toolCallId,
        threadId: (currentThreadId as string)!,
        action: "deny",
        reason,
      });
    },
    [effectiveTransport, currentThreadId]
  );

  const rehydrateMessageState = useCallback(
    (messageId: string) => {
      const msgs = (engineMessages as ConversationMessage[] | null) || [];
      const message = msgs.find((m) => m.id === messageId);
      if (message?.clientState) {
        config.onStateRehydrate?.(message.clientState, messageId);
      }
    },
    [engineMessages, config]
  );

  // Logging lifecycle
  useEffect(() => {
    logger.log(AgentsEvents.Init, {
      hasStateFn: typeof config.state === "function",
      initialThreadId: config.initialThreadId,
      enableThreadValidation: config.enableThreadValidation,
    });
    return () => logger.log(AgentsEvents.Unmount, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logger.log(AgentsEvents.StatusChanged, { status: engineStatus });
  }, [engineStatus, logger]);

  useEffect(() => {
    const s = engineRef.current?.getState();
    logger.log(AgentsEvents.ConnectionChanged, { connected: Boolean(s?.isConnected) });
  });

  useEffect(() => {
    logger.log(AgentsEvents.CurrentThreadChanged, {
      currentThreadId,
    });
  }, [currentThreadId, logger]);

  useEffect(() => {
    const list = (engineMessages as ConversationMessage[] | null) || [];
    const last = list[list.length - 1];
    logger.log(AgentsEvents.MessagesChanged, {
      count: list.length,
      lastId: last?.id,
      lastRole: last?.role,
    });
  }, [engineMessages, logger]);

  return {
    // Agent state
    messages: (engineMessages as any) || [],
    status: (engineStatus as any) || "idle",
    isConnected: Boolean(engineRef.current?.getState().isConnected),
    currentAgent: undefined,
    error: undefined,
    clearError: () => {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      try { engineRef.current?.dispatch({ type: 'CLEAR_THREAD_ERROR', threadId: tid } as any); } catch {}
    },

    // Thread state
    threads: threadsWithFlags as Thread[],
    threadsLoading,
    threadsHasMore,
    threadsError,
    currentThreadId,

    // Loading: true only while selected thread hasn't loaded history yet
    isLoadingInitialThread: Boolean((config.initialThreadId || currentThreadId) && !currentThreadHistoryLoaded),

    // Unified actions
    sendMessage,
    sendMessageToThread,
    cancel: async () => {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      if (!effectiveTransport?.cancelMessage) return;
      await effectiveTransport.cancelMessage({ threadId: tid } as any);
    },
    approveToolCall,
    denyToolCall,

    // Thread navigation
    switchToThread,
    setCurrentThreadId,

    // Advanced thread operations
    loadThreadHistory,
    clearThreadMessages: (threadId: string) => {
      try { engineRef.current?.dispatch({ type: 'CLEAR_THREAD_MESSAGES', threadId } as any); } catch {}
    },
    replaceThreadMessages: (threadId: string, messages: ConversationMessage[]) => {
      try { engineRef.current?.dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId, messages } as any); } catch {}
    },

    // Thread CRUD
    deleteThread: async (threadId: string) => {
      await deleteThreadFn(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (currentThreadId === threadId) {
        setCurrentThreadIdState(null);
      }
    },
    loadMoreThreads: async () => {
      if (!threadsHasMore || threadsLoading) return;
      await loadThreads(true);
    },
    refreshThreads: async () => {
      setOffset(0);
      await loadThreads(false);
    },

    // Thread creation
    createNewThread,

    // Editing support
    rehydrateMessageState,
  } satisfies UseAgentsReturn;
}


