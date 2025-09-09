"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useProviderContext, resolveIdentity, resolveTransport } from "./provider.js";
import { AgentsEvents } from "./events.js";
import { createTransportHelpers } from "./transport.js";
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
// mergeThreadsPreserveOrder now lives in core ThreadManager; use instance method instead

export function useAgents(config: UseAgentsConfig = {}): UseAgentsReturn {
  const logger = useMemo(
    () => createDebugLogger("useAgents", config?.debug ?? false),
    [config?.debug]
  );

  const provider = useProviderContext();
  const { userId, channelKey } = resolveIdentity({
    configUserId: config.userId,
    configChannelKey: config.channelKey,
    provider,
  });
  const transport = resolveTransport(null, provider);
  const effectiveChannel = provider.resolvedChannelKey || channelKey || userId || null;

  // Create thin helpers which prefer transport when available
  const helpers = useMemo(
    () => createTransportHelpers(transport, channelKey ?? null),
    [transport, channelKey]
  );

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
  const [engineVersion, setEngineVersion] = useState(0);
  const bumpEngine = useCallback(() => setEngineVersion((v) => v + 1), []);
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
    () => (config.fetchThreads as any) || (helpers.fetchThreads as any),
    [config.fetchThreads, helpers]
  );
  const fetchHistoryFn = useMemo(
    () => (config.fetchHistory as any) || (helpers.fetchHistory as any),
    [config.fetchHistory, helpers]
  );
  const createThreadFn = useMemo(
    () => (config.createThread as any) || (helpers.createThread as any),
    [config.createThread, helpers]
  );
  const deleteThreadFn = useMemo(
    () => (config.deleteThread as any) || (helpers.deleteThread as any),
    [config.deleteThread, helpers]
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
  const engineStatus = useMemo(() => {
    if (!config.useEngineForStatus || !engineRef.current) return null;
    const s = engineRef.current.getState() as any;
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    const ts = s?.threads?.[tid];
    return (ts?.agentStatus as string) || null;
  }, [config.useEngineForStatus, currentThreadId, engineVersion]);

  // Derive messages from engine state if enabled
  const engineMessages = useMemo<ConversationMessage[] | null>(() => {
    if (!config.useEngineForMessages || !engineRef.current) return null;
    const s = engineRef.current.getState() as any;
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    const ts = s?.threads?.[tid];
    return (ts?.messages as ConversationMessage[]) || null;
  }, [config.useEngineForMessages, currentThreadId, engineVersion]);

  useConnectionSubscription({
    connection: provider.connection,
    channel: effectiveChannel,
    userId,
    threadId: currentThreadId,
    debug: Boolean(config.debug),
    refreshToken: transport
      ? async () => {
          const tid = currentThreadId || fallbackThreadIdRef.current!;
          return await (transport as any).getRealtimeToken({
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
      if (!shouldProcessEvent(evt as any, { userId, threadId: currentThreadId })) return;
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
      bumpEngine();
    }, [logger, userId, currentThreadId, config.debug, bumpEngine]),
    onStateChange: useCallback((state: unknown) => {
      logger.log("[realtime:state]", state);
      try {
        // Only trigger re-render when connected flag actually changes
        engineRef.current?.dispatch({ type: "CONNECTION_STATE_CHANGED", state } as any);
        const connected = String(state) === 'Active';
        if (lastConnectedRef.current !== connected) {
          lastConnectedRef.current = connected;
          bumpEngine();
        }
      } catch {}
    }, [logger, bumpEngine]),
  });

  // Utility getters
  const getThreadState = useCallback((tid: string) => {
    const s = engineRef.current?.getState() as any;
    return s?.threads?.[tid] as any;
  }, []);

  // Initial route-based thread load
  const isLoadingInitialThreadRef = useRef(false);
  const lastInitialIdRef = useRef<string | null>(null);
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

  // Actions
  const setCurrentThreadId = useCallback(
    (threadId: string) => {
      try { engineRef.current?.dispatch({ type: 'SET_CURRENT_THREAD', threadId } as any); } catch {}
      setCurrentThreadIdState(threadId);
      logger.log("setCurrentThreadId", { threadId });
      bumpEngine();
    },
    [logger, bumpEngine]
  );

  const loadThreadHistory = useCallback(
    async (threadId: string): Promise<ConversationMessage[]> => {
      try {
        const dbMessages: any[] = await fetchHistoryFn(threadId);
        return threadManagerRef.current!.formatRawHistoryMessages(dbMessages);
      } catch (err) {
        logger.error("loadThreadHistory failed:", err);
        return [];
      }
    },
    [fetchHistoryFn, logger]
  );

  const switchToThread = useCallback(
    async (threadId: string) => {
      // Immediate switch for responsive UX
      setCurrentThreadId(threadId);

      // Optionally validate/load history when transport is available
      try {
        if (config.enableThreadValidation !== false) {
          const history = await loadThreadHistory(threadId);
          try { engineRef.current?.dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId, messages: history } as any); } catch {}
          bumpEngine();
        }
      } catch (err) {
        logger.warn("switchToThread validation/load failed", err);
        config.onThreadNotFound?.(threadId);
      }
    },
    [setCurrentThreadId, loadThreadHistory, config, logger, bumpEngine]
  );

  const createNewThread = useCallback(() => {
    const id = uuidv4();
    try { engineRef.current?.dispatch({ type: 'CREATE_THREAD', threadId: id } as any); } catch {}
    setCurrentThreadIdState(id);
    logger.log("createNewThread", { id });
    bumpEngine();
    return id;
  }, [logger, bumpEngine]);

  const sendMessageToThread = useCallback(
    async (threadId: string | null, message: string, options?: { messageId?: string; state?: Record<string, unknown> | (() => Record<string, unknown>) }) => {
      if (!transport) return;
      const tid = threadId || fallbackThreadIdRef.current!;
      const messageId = options?.messageId ?? uuidv4();
      const clientState = options?.state
        ? (typeof options.state === 'function' ? (options.state as any)() : options.state)
        : (typeof config.state === 'function' ? config.state() : undefined);

      // optimistic user message
      try {
        engineRef.current?.dispatch({ type: 'MESSAGE_SENT', threadId: tid, message, messageId, clientState } as any);
        bumpEngine();
      } catch {}

      const msgs = (getThreadState(tid)?.messages || []) as ConversationMessage[];
      const history = formatMessagesToAgentKitHistory(msgs);
      try {
        await transport.sendMessage({
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
        try { engineRef.current?.dispatch({ type: 'MESSAGE_SEND_SUCCESS', threadId: tid, messageId } as any); bumpEngine(); } catch {}
      } catch (err) {
        try { engineRef.current?.dispatch({ type: 'MESSAGE_SEND_FAILED', threadId: tid, messageId, error: (err instanceof Error ? err.message : String(err)) } as any); bumpEngine(); } catch {}
        throw err;
      }
    },
    [transport, userId, channelKey, config.state, getThreadState, bumpEngine, fetchHistoryFn]
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
      if (!transport) return;
      await transport.approveToolCall({
        toolCallId,
        threadId: (currentThreadId as string)!,
        action: "approve",
        reason,
      });
    },
    [transport, currentThreadId]
  );

  const denyToolCall = useCallback(
    async (toolCallId: string, reason?: string) => {
      if (!transport) return;
      await transport.approveToolCall({
        toolCallId,
        threadId: (currentThreadId as string)!,
        action: "deny",
        reason,
      });
    },
    [transport, currentThreadId]
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
      try { engineRef.current?.dispatch({ type: 'CLEAR_THREAD_ERROR', threadId: tid } as any); bumpEngine(); } catch {}
    },

    // Thread state
    threads: threads as Thread[],
    threadsLoading,
    threadsHasMore,
    threadsError,
    currentThreadId,

    // Loading
    isLoadingInitialThread: isLoadingInitialThreadRef.current,

    // Unified actions
    sendMessage,
    sendMessageToThread,
    cancel: async () => {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      if (!transport?.cancelMessage) return;
      await transport.cancelMessage({ threadId: tid } as any);
    },
    approveToolCall,
    denyToolCall,

    // Thread navigation
    switchToThread,
    setCurrentThreadId,

    // Advanced thread operations
    loadThreadHistory,
    clearThreadMessages: (threadId: string) => {
      try { engineRef.current?.dispatch({ type: 'CLEAR_THREAD_MESSAGES', threadId } as any); bumpEngine(); } catch {}
    },
    replaceThreadMessages: (threadId: string, messages: ConversationMessage[]) => {
      try { engineRef.current?.dispatch({ type: 'REPLACE_THREAD_MESSAGES', threadId, messages } as any); bumpEngine(); } catch {}
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


