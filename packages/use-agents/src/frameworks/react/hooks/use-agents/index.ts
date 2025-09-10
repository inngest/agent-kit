"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import {
  useProviderContext,
  resolveIdentity,
  resolveTransport,
} from "./provider-context.js";
import { AgentsEvents } from "./logging-events.js";
import { reduceStreamingState } from "../../../../core/index.js";
import { DEFAULT_THREAD_PAGE_SIZE } from "../../../../constants.js";
import { StreamingEngine, ThreadManager } from "../../../../core/index.js";
import {
  mapToNetworkEvent,
  shouldProcessEvent,
} from "../../../../core/services/event-mapper.js";
// removed domain errors: now unused
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
  const renderSessionIdRef = useRef<string>(
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
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
  const transport = resolveTransport(config.transport || null, provider);
  const effectiveChannel =
    provider.resolvedChannelKey || channelKey || userId || null;

  // Establish effective transport (provider or default HTTP)
  const effectiveTransport = useMemo(() => {
    return transport ?? createDefaultHttpTransport();
  }, [transport]);

  // Local engine for realtime + local state
  const engineRef = useRef<StreamingEngine | null>(null);
  // Broadcast channel for cross-tab sync
  const tabIdRef = useRef<string>(`tab-${Math.random().toString(36).slice(2)}`);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const appliedEventIdsRef = useRef<Set<string>>(new Set());
  const perThreadRunBufferRef = useRef<Map<string, any[]>>(new Map());
  const dedupKeyForEvent = useCallback((evt: any): string => {
    try {
      const data =
        evt && typeof evt === "object" && "data" in evt ? evt.data || {} : {};
      const tid = typeof data.threadId === "string" ? data.threadId : "";
      const mid = typeof data.messageId === "string" ? data.messageId : "";
      const pid = typeof data.partId === "string" ? data.partId : "";
      const ev = typeof evt?.event === "string" ? evt.event : "";
      const seq =
        typeof evt?.sequenceNumber === "number"
          ? String(evt.sequenceNumber)
          : "";
      const id = typeof evt?.id === "string" ? evt.id : "";
      return `${tid}|${mid}|${pid}|${ev}|${seq}|${id}`;
    } catch {
      return JSON.stringify(evt);
    }
  }, []);
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
  const subscribe = useCallback(
    (fn: () => void) => engineRef.current!.subscribe(fn),
    []
  );
  const getSnapshot = useCallback(() => engineRef.current!.getState(), []);
  const lastConnectedRef = useRef<boolean | null>(null);

  // Provide a stable fallback thread ID when none is selected yet
  const fallbackThreadIdRef = useRef<string | null>(null);
  if (fallbackThreadIdRef.current === null) {
    fallbackThreadIdRef.current = uuidv4();
  }

  // === Internal thread state (consolidated) ===
  const [currentThreadId, setCurrentThreadIdState] = useState<string | null>(
    null
  );

  const threadManagerRef = useRef<ThreadManager | null>(null);
  if (!threadManagerRef.current) threadManagerRef.current = new ThreadManager();

  const fetchThreadsFn = useMemo(
    () =>
      (config.fetchThreads as any) ||
      (async (uid: string, pagination: any) => {
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
    () =>
      (config.fetchHistory as any) ||
      (async (tid: string) => {
        return effectiveTransport.fetchHistory({ threadId: tid });
      }),
    [config.fetchHistory, effectiveTransport]
  );
  const createThreadFn = useMemo(
    () =>
      (config.createThread as any) ||
      (async (uid: string) => {
        return effectiveTransport.createThread({
          userId: uid,
          channelKey: channelKey || undefined,
        });
      }),
    [config.createThread, effectiveTransport, channelKey]
  );
  const deleteThreadFn = useMemo(
    () =>
      (config.deleteThread as any) ||
      (async (tid: string) => {
        return effectiveTransport.deleteThread({ threadId: tid });
      }),
    [config.deleteThread, effectiveTransport]
  );

  // === Threads: TanStack Query (infinite) or local fallback ===
  const identityKey =
    provider.resolvedChannelKey || channelKey || userId || null;
  let hasQueryProvider = true;
  let queryClient: ReturnType<typeof useQueryClient> | null = null;
  try {
    queryClient = useQueryClient();
  } catch {
    hasQueryProvider = false;
    queryClient = null;
  }

  type ThreadsPage = {
    threads: Thread[];
    hasMore: boolean;
    total: number;
    nextCursorTimestamp?: string | null;
    nextCursorId?: string | null;
  };

  // Local fallback state when no QueryClientProvider is present
  const [threadsLocal, setThreadsLocal] = useState<Thread[]>([]);
  const [threadsLoadingLocal, setThreadsLoadingLocal] = useState<boolean>(true);
  const [threadsHasMoreLocal, setThreadsHasMoreLocal] = useState<boolean>(true);
  const [threadsErrorLocal, setThreadsErrorLocal] = useState<string | null>(
    null
  );
  const [offsetLocal, setOffsetLocal] = useState<number>(0);

  useEffect(() => {
    if (hasQueryProvider) return; // handled by TanStack Query
    if (!userId && !channelKey) return;
    let cancelled = false;
    (async () => {
      try {
        setThreadsLoadingLocal(true);
        setThreadsErrorLocal(null);
        const pageSize =
          Number.isFinite(config.threadsPageSize as number) &&
          (config.threadsPageSize as number) > 0
            ? (config.threadsPageSize as number)
            : DEFAULT_THREAD_PAGE_SIZE;
        const data = await fetchThreadsFn(userId as string, {
          limit: pageSize,
          offset: 0,
        });
        if (cancelled) return;
        setThreadsLocal(data.threads || []);
        setThreadsHasMoreLocal(Boolean(data.hasMore));
        setOffsetLocal(data.threads?.length || 0);
      } catch (e) {
        if (cancelled) return;
        setThreadsErrorLocal(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setThreadsLoadingLocal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasQueryProvider, userId, channelKey, fetchThreadsFn]);

  let threadsQuery: any = null;
  if (hasQueryProvider) {
    threadsQuery = useInfiniteQuery({
      queryKey: ["useAgents", "threads", identityKey],
      queryFn: async ({
        pageParam,
      }: {
        pageParam?: number;
      }): Promise<ThreadsPage> => {
        const pageSize =
          Number.isFinite(config.threadsPageSize as number) &&
          (config.threadsPageSize as number) > 0
            ? (config.threadsPageSize as number)
            : DEFAULT_THREAD_PAGE_SIZE;
        const pagination = { limit: pageSize, offset: pageParam ?? 0 } as any;
        return await fetchThreadsFn(userId as string, pagination);
      },
      getNextPageParam: (lastPage: ThreadsPage, allPages: ThreadsPage[]) => {
        if (!lastPage?.hasMore) return undefined;
        const totalSoFar = (allPages || []).reduce(
          (sum, p) => sum + (p?.threads?.length || 0),
          0
        );
        return totalSoFar;
      },
      initialPageParam: 0,
      enabled: Boolean(userId || channelKey),
      staleTime: 120_000,
      gcTime: 1_800_000,
      refetchOnWindowFocus: false,
    } as any);
  }

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
      logger.log("[diag:init-load]", {
        hasRealThread,
        tidUsed: tid,
        isFallback: tid === fallbackThreadIdRef.current!,
        historyLoadedForTid,
        refLoading,
        computedIsLoading,
      });
    } catch {}
  }, [
    config.debug,
    currentThreadId,
    engineState,
    currentThreadHistoryLoaded,
    logger,
  ]);

  // Derive hasNewMessages flags for threads from engine state
  const computedThreads = useMemo(() => {
    const tm = threadManagerRef.current!;
    if (hasQueryProvider) {
      const pages = (threadsQuery?.data?.pages || []) as any[];
      const list = pages.flatMap((p: any) => p?.threads || []);
      return tm.mergeThreadsPreserveOrder([], list as any);
    }
    return tm.mergeThreadsPreserveOrder([], threadsLocal as any);
  }, [hasQueryProvider, threadsQuery?.data, threadsLocal]);

  const threadsWithFlags = useMemo(() => {
    const s = engineState as any;
    if (!s || !s.threads) return computedThreads;
    return computedThreads.map((t) => {
      const ts = s.threads?.[t.id];
      return ts?.hasNewMessages
        ? ({ ...t, hasNewMessages: true } as Thread)
        : t;
    });
  }, [computedThreads, engineState]);

  useConnectionSubscription({
    connection: provider.connection,
    channel: effectiveChannel,
    userId,
    threadId: currentThreadId,
    debug: Boolean(config.debug),
    refreshToken:
      (transport ?? effectiveTransport)
        ? async () => {
            const tid = currentThreadId || fallbackThreadIdRef.current!;
            return await (
              (transport ?? effectiveTransport) as any
            ).getRealtimeToken({
              userId,
              threadId: tid,
              channelKey: effectiveChannel || userId,
            });
          }
        : undefined,
    onMessage: useCallback(
      (chunk: unknown) => {
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
        // Dedup per event id
        const dk = dedupKeyForEvent(evt);
        if (appliedEventIdsRef.current.has(dk)) {
          return;
        }
        appliedEventIdsRef.current.add(dk);
        // Update per-thread run buffer (reset on run.started / run.completed)
        try {
          const tid =
            (evt as any)?.data?.threadId ||
            currentThreadId ||
            fallbackThreadIdRef.current!;
          if (evt.event === "run.started" && tid) {
            perThreadRunBufferRef.current.set(tid, []);
          }
          const buf = perThreadRunBufferRef.current.get(tid) || [];
          buf.push(evt);
          // trim buffer size
          if (buf.length > 1000) buf.shift();
          perThreadRunBufferRef.current.set(tid, buf);
          if (
            (evt.event === "run.completed" || evt.event === "stream.ended") &&
            tid
          ) {
            // On completion, keep the final assembled assistant message by leaving
            // the buffer intact; do not clear immediately so new tabs can snapshot
            // the full set of events for a brief window. A cleanup timer can purge later.
            // We'll purge on thread switch or after a delay.
            setTimeout(() => {
              try {
                // Only purge if no newer events appended (length small and last is completed)
                const cur = perThreadRunBufferRef.current.get(tid) || [];
                if (cur.length > 0)
                  perThreadRunBufferRef.current.set(tid, cur.slice(-200));
              } catch {}
            }, 3000);
          }
        } catch {}
        // Apply to engine
        engineRef.current.handleRealtimeMessages([evt]);
        // Broadcast to sibling tabs
        try {
          bcRef.current?.postMessage({
            type: "evt",
            sender: tabIdRef.current,
            evt,
          });
        } catch {}
      },
      [logger, userId, currentThreadId, config.debug, dedupKeyForEvent]
    ),
    onStateChange: useCallback(
      (state: unknown) => {
        logger.log("[realtime:state]", state);
        try {
          // Only trigger re-render when connected flag actually changes
          engineRef.current?.dispatch({
            type: "CONNECTION_STATE_CHANGED",
            state,
          } as any);
          const connected = String(state) === "Active";
          if (lastConnectedRef.current !== connected) {
            lastConnectedRef.current = connected;
          }
          try {
            bcRef.current?.postMessage({
              type: "state",
              sender: tabIdRef.current,
              state,
            });
          } catch {}
        } catch {}
      },
      [logger]
    ),
  });

  // Setup BroadcastChannel for cross-tab sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!effectiveChannel) return;
    const bc = new BroadcastChannel(`agentkit-stream:${effectiveChannel}`);
    bcRef.current = bc;
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.sender === tabIdRef.current) return;
      if (msg.type === "evt" && msg.evt) {
        const evt = msg.evt;
        const dk = dedupKeyForEvent(evt);
        if (appliedEventIdsRef.current.has(dk)) return;
        appliedEventIdsRef.current.add(dk);
        engineRef.current?.handleRealtimeMessages([evt]);
        try {
          const tid =
            evt?.data?.threadId ||
            currentThreadId ||
            fallbackThreadIdRef.current!;
          const buf = perThreadRunBufferRef.current.get(tid) || [];
          buf.push(evt);
          if (buf.length > 1000) buf.shift();
          perThreadRunBufferRef.current.set(tid, buf);
        } catch {}
      } else if (msg.type === "snapshot:request") {
        const tid = msg.threadId as string | undefined;
        if (!tid) return;
        const buf = perThreadRunBufferRef.current.get(tid) || [];
        if (buf.length > 0) {
          try {
            bc.postMessage({
              type: "snapshot:response",
              sender: tabIdRef.current,
              threadId: tid,
              events: buf,
            });
          } catch {}
        }
      } else if (msg.type === "snapshot:response") {
        const tid = msg.threadId as string | undefined;
        const events = Array.isArray(msg.events) ? msg.events : [];
        if (!tid || events.length === 0) return;
        for (const evt of events) {
          const dk = dedupKeyForEvent(evt);
          if (appliedEventIdsRef.current.has(dk)) continue;
          appliedEventIdsRef.current.add(dk);
          engineRef.current?.handleRealtimeMessages([evt]);
        }
      }
    };
    bc.addEventListener("message", onMessage as any);
    // Request snapshot for current thread shortly after mount/switch
    const req = setTimeout(() => {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      try {
        bc.postMessage({
          type: "snapshot:request",
          sender: tabIdRef.current,
          threadId: tid,
        });
      } catch {}
    }, 50);
    return () => {
      clearTimeout(req);
      try {
        bc.removeEventListener("message", onMessage as any);
      } catch {}
      try {
        bc.close();
      } catch {}
      if (bcRef.current === bc) bcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChannel]);

  // Utility getters
  const getThreadState = useCallback((tid: string) => {
    const s = engineRef.current?.getState() as any;
    return s?.threads?.[tid];
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
      .catch((err: unknown) =>
        logger.error("Failed to load initial thread:", err)
      )
      .finally(() => {
        isLoadingInitialThreadRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.initialThreadId]);

  const getHistoryQueryKey = useCallback(
    (tid: string) => ["useAgents", "threadHistory", tid] as const,
    []
  );

  const loadThreadHistory = useCallback(
    async (threadId: string): Promise<ConversationMessage[]> => {
      try {
        const t0 = Date.now();
        const requestId = `${threadId}-${t0}`;
        logger.log(AgentsEvents.HistoryFetchStart, {
          threadId,
          requestId,
          currentThreadIdAtStart: currentThreadId,
          renderSessionId: renderSessionIdRef.current,
        });
        let formatted: ConversationMessage[];
        if (hasQueryProvider && queryClient) {
          formatted = await queryClient.fetchQuery({
            queryKey: getHistoryQueryKey(threadId),
            queryFn: async () => {
              const dbMessages: any[] = await fetchHistoryFn(threadId);
              return threadManagerRef.current!.formatRawHistoryMessages(
                dbMessages
              );
            },
            staleTime: 300_000,
            gcTime: 3_600_000,
          } as any);
        } else {
          const dbMessages: any[] = await fetchHistoryFn(threadId);
          formatted =
            threadManagerRef.current!.formatRawHistoryMessages(dbMessages);
        }
        const dt = Date.now() - t0;
        logger.log(AgentsEvents.HistoryFetchEnd, {
          threadId,
          requestId,
          ms: dt,
          count: (formatted as any[])?.length || 0,
          currentThreadIdAtEnd: currentThreadId,
        });
        if (Array.isArray(formatted) && formatted.length === 0) {
          logger.log(AgentsEvents.HistoryFetchEmpty, {
            threadId,
            requestId,
            ms: dt,
          });
        }
        return formatted;
      } catch (err: unknown) {
        logger.error("loadThreadHistory failed:", err);
        return [] as ConversationMessage[];
      }
    },
    [
      fetchHistoryFn,
      logger,
      currentThreadId,
      queryClient,
      getHistoryQueryKey,
      hasQueryProvider,
    ]
  );

  // Removed sessionStorage hydration in favor of cross-tab BroadcastChannel snapshotting

  // Domain-aware revalidation: if selected thread claims messages but engine has none, refetch once
  useEffect(() => {
    const tid = currentThreadId || null;
    if (!tid) return;
    const selected = computedThreads.find((t) => t.id === tid);
    const msgs = engineMessages || [];
    if (!selected) return;
    if (
      selected.messageCount > 0 &&
      msgs.length === 0 &&
      !revalidatedOnceRef.current.has(tid)
    ) {
      revalidatedOnceRef.current.add(tid);
      if (config.debug)
        logger.log(
          "[revalidate] missing history despite messageCount>0; refetching",
          { tid, messageCount: selected.messageCount }
        );
      const handle = setTimeout(async () => {
        try {
          const history = await loadThreadHistory(tid);
          const current = engineRef.current?.getState()?.currentThreadId;
          if (current !== tid) return;
          try {
            engineRef.current?.dispatch({
              type: "REPLACE_THREAD_MESSAGES",
              threadId: tid,
              messages: history,
            } as any);
          } catch {}
        } catch (err) {
          if (config.debug)
            logger.warn("[revalidate] history refetch failed", err);
        }
      }, 400);
      return () => clearTimeout(handle);
    }
  }, [
    currentThreadId,
    computedThreads,
    engineMessages,
    loadThreadHistory,
    logger,
    config.debug,
  ]);

  // Actions
  const setCurrentThreadId = useCallback(
    (threadId: string) => {
      try {
        engineRef.current?.dispatch({
          type: "SET_CURRENT_THREAD",
          threadId,
        } as any);
      } catch {}
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
      try {
        engineRef.current?.dispatch({
          type: "MARK_THREAD_VIEWED",
          threadId,
        } as any);
      } catch {}

      // Render from cache immediately if available, then fetch/refetch
      try {
        const cached =
          hasQueryProvider && queryClient
            ? queryClient.getQueryData(getHistoryQueryKey(threadId))
            : undefined;
        if (Array.isArray(cached) && cached.length > 0) {
          try {
            engineRef.current?.dispatch({
              type: "REPLACE_THREAD_MESSAGES",
              threadId,
              messages: cached,
            } as any);
          } catch {}
          logger.log(AgentsEvents.EngineReplaceMessages, {
            threadId,
            source: "cache",
            count: cached.length,
            currentThreadIdAtApply:
              engineRef.current?.getState()?.currentThreadId,
            renderSessionId: renderSessionIdRef.current,
          });
        }

        if (config.enableThreadValidation !== false) {
          const history = await loadThreadHistory(threadId);
          const current = engineRef.current?.getState()?.currentThreadId;
          if (current === threadId) {
            try {
              engineRef.current?.dispatch({
                type: "REPLACE_THREAD_MESSAGES",
                threadId,
                messages: history,
              } as any);
            } catch {}
            logger.log(AgentsEvents.EngineReplaceMessages, {
              threadId,
              source: "fetch",
              count: history?.length || 0,
              currentThreadIdAtApply: current,
              renderSessionId: renderSessionIdRef.current,
            });
          }
        }
      } catch (err: unknown) {
        logger.warn("switchToThread validation/load failed", err);
        config.onThreadNotFound?.(threadId);
      }
    },
    [
      setCurrentThreadId,
      loadThreadHistory,
      config,
      logger,
      queryClient,
      getHistoryQueryKey,
      hasQueryProvider,
    ]
  );

  const createNewThread = useCallback(() => {
    const id = uuidv4();
    try {
      engineRef.current?.dispatch({
        type: "CREATE_THREAD",
        threadId: id,
      } as any);
    } catch {}
    setCurrentThreadIdState(id);
    logger.log("createNewThread", { id });
    return id;
  }, [logger]);

  const sendMessageToThread = useCallback(
    async (
      threadId: string | null,
      message: string,
      options?: {
        messageId?: string;
        state?: Record<string, unknown> | (() => Record<string, unknown>);
      }
    ) => {
      if (!effectiveTransport) return;
      const tid = threadId || fallbackThreadIdRef.current!;
      const messageId = options?.messageId ?? uuidv4();
      const clientState = options?.state
        ? typeof options.state === "function"
          ? (options.state as any)()
          : options.state
        : typeof config.state === "function"
          ? config.state()
          : undefined;

      // optimistic user message
      try {
        engineRef.current?.dispatch({
          type: "MESSAGE_SENT",
          threadId: tid,
          message,
          messageId,
          clientState,
        } as any);
      } catch {}

      const msgs = (getThreadState(tid)?.messages ||
        []) as ConversationMessage[];
      const history = formatMessagesToAgentKitHistory(msgs);
      try {
        await effectiveTransport.sendMessage({
          userMessage: {
            id: messageId,
            content: message,
            role: "user",
            state: clientState,
            clientTimestamp: new Date(),
          },
          threadId: tid,
          history,
          userId,
          channelKey: channelKey,
        } as any);
        try {
          engineRef.current?.dispatch({
            type: "MESSAGE_SEND_SUCCESS",
            threadId: tid,
            messageId,
          } as any);
        } catch {}
      } catch (err: unknown) {
        try {
          engineRef.current?.dispatch({
            type: "MESSAGE_SEND_FAILED",
            threadId: tid,
            messageId,
            error: err instanceof Error ? err.message : String(err),
          } as any);
        } catch {}
        throw err;
      }
    },
    [
      effectiveTransport,
      userId,
      channelKey,
      config.state,
      getThreadState,
      fetchHistoryFn,
    ]
  );

  const sendMessage = useCallback(
    async (message: string, options?: { messageId?: string }) => {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      logger.log("sendMessage:start", { threadId: tid });
      await sendMessageToThread(tid, message, {
        messageId: options?.messageId,
      });
    },
    [currentThreadId, sendMessageToThread, logger]
  );

  const approveToolCall = useCallback(
    async (toolCallId: string, reason?: string) => {
      if (!effectiveTransport) return;
      await effectiveTransport.approveToolCall({
        toolCallId,
        threadId: currentThreadId as string,
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
        threadId: currentThreadId as string,
        action: "deny",
        reason,
      });
    },
    [effectiveTransport, currentThreadId]
  );

  const rehydrateMessageState = useCallback(
    (messageId: string) => {
      const msgs = engineMessages || [];
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
    logger.log(AgentsEvents.ConnectionChanged, {
      connected: Boolean(s?.isConnected),
    });
  });

  useEffect(() => {
    logger.log(AgentsEvents.CurrentThreadChanged, {
      currentThreadId,
    });
  }, [currentThreadId, logger]);

  useEffect(() => {
    const list = engineMessages || [];
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
      try {
        engineRef.current?.dispatch({
          type: "CLEAR_THREAD_ERROR",
          threadId: tid,
        } as any);
      } catch {}
    },

    // Thread state
    threads: threadsWithFlags,
    threadsLoading: hasQueryProvider
      ? Boolean(threadsQuery?.isLoading)
      : threadsLoadingLocal,
    threadsHasMore: hasQueryProvider
      ? Boolean(threadsQuery?.hasNextPage)
      : threadsHasMoreLocal,
    threadsError: hasQueryProvider
      ? threadsQuery?.error
        ? threadsQuery.error instanceof Error
          ? threadsQuery.error.message
          : String(threadsQuery.error)
        : null
      : threadsErrorLocal,
    currentThreadId,

    // Loading: true only while selected thread hasn't loaded history yet
    isLoadingInitialThread: Boolean(
      (config.initialThreadId || currentThreadId) && !currentThreadHistoryLoaded
    ),

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
      try {
        engineRef.current?.dispatch({
          type: "CLEAR_THREAD_MESSAGES",
          threadId,
        } as any);
      } catch {}
    },
    replaceThreadMessages: (
      threadId: string,
      messages: ConversationMessage[]
    ) => {
      try {
        engineRef.current?.dispatch({
          type: "REPLACE_THREAD_MESSAGES",
          threadId,
          messages,
        } as any);
      } catch {}
    },

    // Thread CRUD
    deleteThread: async (threadId: string) => {
      await deleteThreadFn(threadId);
      try {
        if (hasQueryProvider && queryClient) {
          queryClient.setQueryData(
            ["useAgents", "threads", identityKey],
            (old: any) => {
              if (!old) return old;
              const pages = (old.pages || []).map((p: any) => ({
                ...p,
                threads: (p.threads || []).filter(
                  (t: any) => t.id !== threadId
                ),
              }));
              return { ...old, pages };
            }
          );
        } else {
          setThreadsLocal((prev: Thread[]) =>
            prev.filter((t: Thread) => t.id !== threadId)
          );
        }
      } catch {}
      if (currentThreadId === threadId) {
        setCurrentThreadIdState(null);
      }
    },
    loadMoreThreads: async () => {
      if (hasQueryProvider) {
        if (!threadsQuery?.hasNextPage || threadsQuery?.isFetchingNextPage)
          return;
        await threadsQuery.fetchNextPage();
        return;
      }
      if (!threadsHasMoreLocal || threadsLoadingLocal) return;
      try {
        setThreadsLoadingLocal(true);
        const pageSize =
          Number.isFinite(config.threadsPageSize as number) &&
          (config.threadsPageSize as number) > 0
            ? (config.threadsPageSize as number)
            : DEFAULT_THREAD_PAGE_SIZE;
        const data = await fetchThreadsFn(userId as string, {
          limit: pageSize,
          offset: offsetLocal,
        });
        setThreadsLocal((prev: Thread[]) => {
          const tm = threadManagerRef.current!;
          return tm.mergeThreadsPreserveOrder(prev as any, data.threads || []);
        });
        setOffsetLocal((prev: number) => prev + (data.threads?.length || 0));
        setThreadsHasMoreLocal(Boolean(data.hasMore));
      } finally {
        setThreadsLoadingLocal(false);
      }
    },
    refreshThreads: async () => {
      if (hasQueryProvider && queryClient) {
        await queryClient.invalidateQueries({
          queryKey: ["useAgents", "threads", identityKey],
        } as any);
        return;
      }
      try {
        setThreadsLoadingLocal(true);
        const pageSize =
          Number.isFinite(config.threadsPageSize as number) &&
          (config.threadsPageSize as number) > 0
            ? (config.threadsPageSize as number)
            : DEFAULT_THREAD_PAGE_SIZE;
        const data = await fetchThreadsFn(userId as string, {
          limit: pageSize,
          offset: 0,
        });
        setThreadsLocal(data.threads || []);
        setThreadsHasMoreLocal(Boolean(data.hasMore));
        setOffsetLocal(data.threads?.length || 0);
      } finally {
        setThreadsLoadingLocal(false);
      }
    },

    // Thread creation
    createNewThread,

    // Editing support
    rehydrateMessageState,
  } satisfies UseAgentsReturn;
}
