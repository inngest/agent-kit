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
  type AgentKitEvent,
  type AgentStatus,
  type StreamingState,
  type ThreadsPage,
  type CrossTabMessage,
  type ToolManifest,
} from "../../../../types/index.js";
import type { InngestSubscriptionState } from "@inngest/realtime/hooks";
import type { UseAgentsConfig, UseAgentsReturn, OnEventMeta } from "./types.js";
import { formatMessagesToAgentKitHistory } from "../../../../utils/message-formatting.js";
import { createDefaultHttpTransport } from "../../../../core/adapters/http-transport.js";
// mergeThreadsPreserveOrder now lives in core ThreadManager; use instance method instead

// Overloads for developer ergonomics
export function useAgents<
  TConfig extends { tools: ToolManifest; state: unknown },
>(
  config: UseAgentsConfig<TConfig["tools"], TConfig["state"]>
): UseAgentsReturn<TConfig["tools"], TConfig["state"]>;

export function useAgents<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
>(
  config: UseAgentsConfig<TManifest, TState>
): UseAgentsReturn<TManifest, TState>;

export function useAgents<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
>(
  config: UseAgentsConfig<TManifest, TState> = {} as UseAgentsConfig<
    TManifest,
    TState
  >
): UseAgentsReturn<TManifest, TState> {
  const logger = useMemo(
    () => createDebugLogger("useAgents", config?.debug ?? false),
    [config?.debug]
  );

  // Stable ref to optional onStreamEnded callback
  const onStreamEndedRef = useRef<UseAgentsConfig["onStreamEnded"]>(
    config.onStreamEnded
  );
  useEffect(() => {
    onStreamEndedRef.current = config.onStreamEnded;
  }, [config.onStreamEnded]);
  // onToolResult callback (generic)
  const onToolResultRef = useRef<
    UseAgentsConfig<TManifest, TState>["onToolResult"]
  >(config.onToolResult);
  useEffect(() => {
    onToolResultRef.current = config.onToolResult;
  }, [config]);

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
  const engineRef = useRef<StreamingEngine<TManifest, TState> | null>(null);
  // Broadcast channel for cross-tab sync
  const tabIdRef = useRef<string>(`tab-${Math.random().toString(36).slice(2)}`);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const appliedEventIdsRef = useRef<Set<string>>(new Set());
  const perThreadRunBufferRef = useRef<Map<string, AgentKitEvent<TManifest>[]>>(
    new Map()
  );
  const dedupKeyForEvent = useCallback(
    (evt: AgentKitEvent<TManifest>): string => {
      try {
        const data = (evt.data as Record<string, unknown>) ?? {};
        const tid = typeof data.threadId === "string" ? data.threadId : "";
        const mid =
          typeof (data as { messageId?: unknown }).messageId === "string"
            ? (data as { messageId?: string }).messageId!
            : "";
        const pid =
          typeof (data as { partId?: unknown }).partId === "string"
            ? (data as { partId?: string }).partId!
            : "";
        const ev = typeof evt.event === "string" ? evt.event : "";
        const seq =
          typeof evt.sequenceNumber === "number"
            ? String(evt.sequenceNumber)
            : "";
        const id = typeof evt.id === "string" ? evt.id : "";
        return `${tid}|${mid}|${pid}|${ev}|${seq}|${id}`;
      } catch {
        return JSON.stringify(evt);
      }
    },
    []
  );
  if (!engineRef.current) {
    engineRef.current = new StreamingEngine({
      initialState: {
        threads: {},
        currentThreadId: "",
        lastProcessedIndex: 0,
        isConnected: false,
      } as unknown as StreamingState<TManifest, TState>,
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
      (config.fetchThreads as
        | ((
            uid: string,
            pagination: {
              limit: number;
              offset?: number;
              cursorTimestamp?: string;
              cursorId?: string;
            }
          ) => Promise<ThreadsPage>)
        | undefined) ||
      (async (
        uid: string,
        pagination: {
          limit: number;
          offset?: number;
          cursorTimestamp?: string;
          cursorId?: string;
        }
      ): Promise<ThreadsPage> => {
        return effectiveTransport.fetchThreads({
          userId: uid,
          channelKey: channelKey || undefined,
          limit: pagination.limit,
          offset: pagination.offset ?? 0,
          cursorTimestamp: pagination.cursorTimestamp,
          cursorId: pagination.cursorId,
        });
      }),
    [config.fetchThreads, effectiveTransport, channelKey]
  );
  const fetchHistoryFn = useMemo(
    () =>
      (config.fetchHistory as (tid: string) => Promise<unknown[]>) ||
      (async (tid: string) => {
        return effectiveTransport.fetchHistory({ threadId: tid });
      }),
    [config.fetchHistory, effectiveTransport]
  );
  const deleteThreadFn = useMemo(
    () =>
      (config.deleteThread as (tid: string) => Promise<void> | undefined) ||
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
    void (async () => {
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

  let threadsQuery: ReturnType<typeof useInfiniteQuery> | null = null;
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
        const pagination = { limit: pageSize, offset: pageParam ?? 0 } as {
          limit: number;
          offset: number;
        };
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
    });
  }

  // Derive status from engine state if enabled
  const engineState = useSyncExternalStore<StreamingState<TManifest, TState>>(
    subscribe,
    getSnapshot,
    getSnapshot
  );
  const engineStatus = useMemo(() => {
    if (!engineState) return null;
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    const ts = engineState.threads?.[tid];
    // Map legacy reducer statuses to new simplified statuses for public API
    // TODO: remove this legacy status mapping
    const legacy =
      (ts?.agentStatus as
        | "idle"
        | "thinking"
        | "calling-tool"
        | "responding"
        | "error"
        | undefined) || undefined;
    let mapped: AgentStatus | null = null;
    switch (legacy) {
      case "idle":
        mapped = "ready";
        break;
      case "thinking":
        mapped = "submitted";
        break;
      case "calling-tool":
      case "responding":
        mapped = "streaming";
        break;
      case "error":
        mapped = "error";
        break;
      default:
        mapped = null;
    }
    return mapped;
  }, [currentThreadId, engineState]);

  // Derive messages from engine state if enabled
  const engineMessages = useMemo<
    ConversationMessage<TManifest, TState>[] | null
  >(() => {
    if (!engineState) return null;
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    const ts = engineState.threads?.[tid] as
      | {
          messages?: ConversationMessage<TManifest, TState>[];
          historyLoaded?: boolean;
        }
      | undefined;
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
    return Array.isArray(ts?.messages) ? ts.messages : null;
  }, [currentThreadId, engineState]);

  const currentThreadHistoryLoaded = useMemo(() => {
    const tid = currentThreadId || fallbackThreadIdRef.current!;
    return Boolean(engineState?.threads?.[tid]?.historyLoaded);
  }, [engineState, currentThreadId]);

  // Derive hasNewMessages flags for threads from engine state
  const computedThreads = useMemo<Thread[]>(() => {
    const tm = threadManagerRef.current!;
    if (hasQueryProvider) {
      const data = threadsQuery?.data as { pages?: ThreadsPage[] } | undefined;
      const pages = data?.pages || [];
      const list = pages.flatMap((p) => p.threads || []);
      return tm.mergeThreadsPreserveOrder([], list);
    }
    return tm.mergeThreadsPreserveOrder([], threadsLocal);
  }, [hasQueryProvider, threadsQuery?.data, threadsLocal]);

  const threadsWithFlags = useMemo(() => {
    const s = engineState;
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
    debug: Boolean(config.debug),
    refreshToken:
      (transport ?? effectiveTransport)
        ? async () => {
            const tid = currentThreadId || fallbackThreadIdRef.current!;
            return await (transport ?? effectiveTransport).getRealtimeToken({
              userId,
              threadId: tid,
              channelKey: effectiveChannel || userId,
            });
          }
        : undefined,
    onMessage: useCallback(
      (chunk: unknown) => {
        logger.log("[UA-DIAG] ui-onMessage", { chunkType: typeof chunk });
        logger.log("[realtime:message]", chunk);
        const evt = mapToNetworkEvent<TManifest>(chunk);
        if (!evt) return;
        // Low-level event callback (WS path)
        try {
          const data = (evt.data || {}) as Record<string, unknown>;
          const meta: OnEventMeta = {
            threadId:
              typeof data["threadId"] === "string"
                ? data["threadId"]
                : undefined,
            runId:
              typeof data["runId"] === "string" ? data["runId"] : undefined,
            scope:
              typeof data["scope"] === "string"
                ? (data["scope"] as OnEventMeta["scope"])
                : undefined,
            messageId:
              typeof data["messageId"] === "string"
                ? data["messageId"]
                : undefined,
            source: "ws",
          };
          config.onEvent?.(evt, meta);
        } catch {
          /* noop */
        }

        // Process all events for this user/channel; reducer routes by evt.data.threadId
        if (!shouldProcessEvent(evt, { userId })) return;
        if (!engineRef.current) {
          engineRef.current = new StreamingEngine({
            initialState: {
              threads: {},
              currentThreadId: currentThreadId || fallbackThreadIdRef.current!,
              lastProcessedIndex: 0,
              isConnected: true,
            },
            debug: Boolean(config.debug),
          });
        }
        // Dedup per event id
        // TODO: why is this needed? comment in the explanation
        const dk = dedupKeyForEvent(evt);
        if (appliedEventIdsRef.current.has(dk)) {
          logger.log("[UA-DIAG] ui-dedup-skip", { id: dk });
          return;
        }
        appliedEventIdsRef.current.add(dk);
        // Update per-thread run buffer (reset on run.started / run.completed)
        try {
          const threadIdValue = evt.data?.threadId;
          const tid =
            typeof threadIdValue === "string"
              ? threadIdValue
              : currentThreadId || fallbackThreadIdRef.current!;
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
              } catch {
                /* empty */
              }
            }, 3000);

            // Invoke optional callback for terminal events
            try {
              const raw = chunk as {
                runId?: string;
                data?: { event?: string; data?: Record<string, unknown> };
              };
              const envelope =
                raw &&
                raw.data &&
                typeof raw.data === "object" &&
                typeof (raw.data as { event?: unknown }).event === "string"
                  ? (raw.data as {
                      event: string;
                      data?: Record<string, unknown>;
                    })
                  : (raw as unknown as {
                      event?: string;
                      data?: Record<string, unknown>;
                    });
              const d = envelope?.data || {};
              const meta: OnEventMeta = {
                threadId: tid,
                messageId:
                  typeof d["messageId"] === "string"
                    ? d["messageId"]
                    : undefined,
                runId:
                  typeof (raw as { runId?: unknown }).runId === "string"
                    ? ((raw as { runId?: string }).runId as string)
                    : typeof d["runId"] === "string"
                      ? d["runId"]
                      : undefined,
                scope:
                  typeof d["scope"] === "string"
                    ? (d["scope"] as OnEventMeta["scope"])
                    : undefined,
              };
              logger.log("[UA-DIAG] ui-onStreamEnded-callback", meta);
              if (meta.threadId) {
                onStreamEndedRef.current?.(
                  meta as unknown as {
                    threadId: string;
                    messageId?: string;
                    runId?: string;
                    scope?: "network" | "agent";
                  }
                );
              }
            } catch {
              /* noop */
            }
          }
        } catch {
          /* empty */
        }
        // Invoke strongly-typed tool result callback when applicable (no any/unsafe access)
        if (evt.event === "part.completed" && onToolResultRef.current) {
          const d = (evt.data || {}) as Record<string, unknown>;
          const type = typeof d["type"] === "string" ? d["type"] : undefined;
          const md = ((): { toolName?: unknown } | undefined => {
            const m = d["metadata"];
            return m && typeof m === "object"
              ? (m as { toolName?: unknown })
              : undefined;
          })();
          const toolName = (
            typeof d["toolName"] === "string"
              ? d["toolName"]
              : typeof md?.toolName === "string"
                ? md.toolName
                : undefined
          ) as keyof TManifest | undefined;
          if (type === "tool-output" && toolName) {
            const partId = typeof d["partId"] === "string" ? d["partId"] : "";
            const messageId =
              typeof d["messageId"] === "string" ? d["messageId"] : "";
            const output = d["finalContent"];

            // Best-effort flattening of data from output when shape is { data: T }

            const data =
              output &&
              typeof output === "object" &&
              "data" in (output as Record<string, unknown>)
                ? (output as { data: unknown }).data
                : (undefined as unknown);

            // Attempt to retrieve tool input from engine state using threadId/messageId/partId
            let input: unknown;
            try {
              const threadIdValue = d["threadId"];
              const tid =
                typeof threadIdValue === "string"
                  ? threadIdValue
                  : currentThreadId || fallbackThreadIdRef.current!;
              const s = engineRef.current?.getState();
              const ts = s?.threads?.[tid];
              const msgs = Array.isArray(ts?.messages) ? ts.messages : [];
              const msg = msgs.find(
                (m) => m.id === messageId && m.role === "assistant"
              );
              const toolPart = msg?.parts.find(
                (p) =>
                  (p as { type?: unknown }).type === "tool-call" &&
                  (p as { toolCallId?: unknown }).toolCallId === partId
              ) as { input?: unknown } | undefined;
              input = toolPart?.input;
            } catch {
              /* noop */
            }

            const result = {
              toolName,
              output,
              data,
              input,
              partId,
              messageId,
            } as unknown as Parameters<
              NonNullable<UseAgentsConfig<TManifest>["onToolResult"]>
            >[0];
            onToolResultRef.current(result);
          }
        }

        // Apply to engine
        engineRef.current.handleRealtimeMessages([evt]);
        // Broadcast to sibling tabs
        try {
          bcRef.current?.postMessage({
            type: "evt",
            sender: tabIdRef.current,
            evt,
          });
        } catch {
          /* empty */
        }
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
            state: state as InngestSubscriptionState,
          });
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
          } catch {
            /* empty */
          }
        } catch {
          /* empty */
        }
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
    const onMessage = (e: MessageEvent<CrossTabMessage<TManifest>>) => {
      const msg = e.data;
      if (!msg || msg.sender === tabIdRef.current) return;
      if (msg.type === "evt" && msg.evt) {
        const evt = msg.evt;
        const dk = dedupKeyForEvent(evt);
        if (appliedEventIdsRef.current.has(dk)) return;
        appliedEventIdsRef.current.add(dk);
        // Low-level event callback (BroadcastChannel path)
        try {
          const data = (evt.data || {}) as Record<string, unknown>;
          const meta: OnEventMeta = {
            threadId:
              typeof data["threadId"] === "string"
                ? data["threadId"]
                : undefined,
            runId:
              typeof data["runId"] === "string" ? data["runId"] : undefined,
            scope:
              typeof data["scope"] === "string"
                ? (data["scope"] as OnEventMeta["scope"])
                : undefined,
            messageId:
              typeof data["messageId"] === "string"
                ? data["messageId"]
                : undefined,
            source: "bc",
          };
          config.onEvent?.(evt, meta);
        } catch {
          /* empty */
        }
        engineRef.current?.handleRealtimeMessages([evt]);
        try {
          const tidVal = evt.data?.threadId;
          const tid =
            typeof tidVal === "string"
              ? tidVal
              : currentThreadId || fallbackThreadIdRef.current!;
          const buf = perThreadRunBufferRef.current.get(tid) || [];
          buf.push(evt);
          if (buf.length > 1000) buf.shift();
          perThreadRunBufferRef.current.set(tid, buf);

          // Callback on terminal events for BC path as well
          if (
            (evt.event === "run.completed" || evt.event === "stream.ended") &&
            tid
          ) {
            try {
              const data = (evt.data || {}) as Record<string, unknown>;
              const meta: OnEventMeta = {
                threadId: tid,
                messageId:
                  typeof data["messageId"] === "string"
                    ? data["messageId"]
                    : undefined,
                runId:
                  typeof data["runId"] === "string" ? data["runId"] : undefined,
                scope:
                  typeof data["scope"] === "string"
                    ? (data["scope"] as OnEventMeta["scope"])
                    : undefined,
              };
              if (meta.threadId) {
                onStreamEndedRef.current?.(
                  meta as unknown as {
                    threadId: string;
                    messageId?: string;
                    runId?: string;
                    scope?: "network" | "agent";
                  }
                );
              }
            } catch {
              /* empty */
            }
          }
        } catch {
          /* empty */
        }
      } else if (msg.type === "snapshot:request") {
        const tid = msg.threadId;
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
          } catch {
            /* empty */
          }
        }
      } else if (msg.type === "snapshot:response") {
        const tid = msg.threadId;
        const events: AgentKitEvent<TManifest>[] = Array.isArray(msg.events)
          ? (msg.events as AgentKitEvent<TManifest>[])
          : [];
        if (!tid || events.length === 0) return;
        for (const evt of events) {
          const dk = dedupKeyForEvent(evt);
          if (appliedEventIdsRef.current.has(dk)) continue;
          appliedEventIdsRef.current.add(dk);
          engineRef.current?.handleRealtimeMessages([evt]);
        }
      }
    };
    bc.addEventListener("message", onMessage as EventListener);
    // Request snapshot for current thread shortly after mount/switch
    const req = setTimeout(() => {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      try {
        bc.postMessage({
          type: "snapshot:request",
          sender: tabIdRef.current,
          threadId: tid,
        });
      } catch {
        /* empty */
      }
    }, 50);
    return () => {
      clearTimeout(req);
      try {
        bc.removeEventListener("message", onMessage as EventListener);
      } catch {
        /* empty */
      }
      try {
        bc.close();
      } catch {
        /* empty */
      }
      if (bcRef.current === bc) bcRef.current = null;
    };
    // Intentionally only re-run on channel changes
  }, [effectiveChannel]);

  // Utility getters
  const getThreadState = useCallback((tid: string) => {
    const s = engineRef.current?.getState();
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
  }, [config.initialThreadId]);

  const getHistoryQueryKey = useCallback(
    (tid: string) => ["useAgents", "threadHistory", tid] as const,
    []
  );

  const loadThreadHistory = useCallback(
    async (
      threadId: string
    ): Promise<ConversationMessage<TManifest, TState>[]> => {
      try {
        const t0 = Date.now();
        const requestId = `${threadId}-${t0}`;
        logger.log(AgentsEvents.HistoryFetchStart, {
          threadId,
          requestId,
          currentThreadIdAtStart: currentThreadId,
          renderSessionId: renderSessionIdRef.current,
        });
        let formatted: ConversationMessage<TManifest, TState>[];
        if (hasQueryProvider && queryClient) {
          formatted = await queryClient.fetchQuery({
            queryKey: getHistoryQueryKey(threadId),
            queryFn: async () => {
              const dbMessages: unknown[] = await fetchHistoryFn(threadId);
              return threadManagerRef.current!.formatRawHistoryMessages(
                dbMessages
              ) as unknown as ConversationMessage<TManifest, TState>[];
            },
            staleTime: 300_000,
            gcTime: 3_600_000,
          });
        } else {
          const dbMessages: unknown[] = await fetchHistoryFn(threadId);
          formatted = threadManagerRef.current!.formatRawHistoryMessages(
            dbMessages
          ) as unknown as ConversationMessage<TManifest, TState>[];
        }
        const dt = Date.now() - t0;
        logger.log(AgentsEvents.HistoryFetchEnd, {
          threadId,
          requestId,
          ms: dt,
          count: formatted?.length || 0,
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
        return [];
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
      const handle = setTimeout(() => {
        void (async () => {
          try {
            const history = await loadThreadHistory(tid);
            const current = engineRef.current?.getState()?.currentThreadId;
            if (current !== tid) return;
            try {
              engineRef.current?.dispatch({
                type: "REPLACE_THREAD_MESSAGES",
                threadId: tid,
                messages: history,
              });
            } catch {
              /* empty */
            }
          } catch (err) {
            if (config.debug)
              logger.warn("[revalidate] history refetch failed", err);
          }
        })();
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
        });
      } catch {
        /* empty */
      }
      setCurrentThreadIdState(threadId);
      logger.log("setCurrentThreadId", { threadId });
    },
    [logger]
  );

  const dispatchReplaceMessages = useCallback(
    (threadId: string, messages: ConversationMessage<TManifest, TState>[]) => {
      try {
        engineRef.current?.dispatch({
          type: "REPLACE_THREAD_MESSAGES",
          threadId,
          messages,
        });
      } catch {
        /* empty */
      }
    },
    []
  );

  const dispatchMarkViewed = useCallback((threadId: string) => {
    try {
      engineRef.current?.dispatch({
        type: "MARK_THREAD_VIEWED",
        threadId,
      });
    } catch {
      /* empty */
    }
  }, []);

  const switchToThread = useCallback(
    async (threadId: string) => {
      // Immediate switch for responsive UX
      setCurrentThreadId(threadId);
      threadSessionIdRef.current++;
      // Clear unread badge for this thread
      dispatchMarkViewed(threadId);

      // Render from cache immediately if available, then fetch/refetch
      try {
        const cached =
          hasQueryProvider && queryClient
            ? queryClient.getQueryData(getHistoryQueryKey(threadId))
            : undefined;
        if (Array.isArray(cached) && cached.length > 0) {
          const cachedMessages = cached as ConversationMessage<
            TManifest,
            TState
          >[];
          dispatchReplaceMessages(threadId, cachedMessages);
          logger.log(AgentsEvents.EngineReplaceMessages, {
            threadId,
            source: "cache",
            count: cachedMessages.length,
            currentThreadIdAtApply:
              engineRef.current?.getState()?.currentThreadId,
            renderSessionId: renderSessionIdRef.current,
          });
        }

        if (config.enableThreadValidation !== false) {
          const history = await loadThreadHistory(threadId);
          const current = engineRef.current?.getState()?.currentThreadId;
          if (current === threadId) {
            dispatchReplaceMessages(threadId, history);
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
      dispatchReplaceMessages,
      dispatchMarkViewed,
    ]
  );

  const createNewThread = useCallback(() => {
    const id = uuidv4();
    try {
      engineRef.current?.dispatch({
        type: "CREATE_THREAD",
        threadId: id,
      });
    } catch {
      /* empty */
    }
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
        state?: TState | (() => TState);
      }
    ) => {
      if (!effectiveTransport) return;
      const tid = threadId || fallbackThreadIdRef.current!;
      const messageId = options?.messageId ?? uuidv4();
      const clientState = options?.state
        ? typeof options.state === "function"
          ? (options.state as () => TState)()
          : options.state
        : typeof config.state === "function"
          ? (config.state as () => TState)()
          : undefined;

      // optimistic user message
      try {
        engineRef.current?.dispatch({
          type: "MESSAGE_SENT",
          threadId: tid,
          message,
          messageId,
          clientState,
        });
      } catch {
        /* empty */
      }

      const msgs = getThreadState(tid)?.messages || [];
      const history = formatMessagesToAgentKitHistory<TManifest, TState>(msgs);
      try {
        await effectiveTransport.sendMessage({
          userMessage: {
            id: messageId,
            content: message,
            role: "user",
            state: clientState as Record<string, unknown> | undefined,
            clientTimestamp: new Date(),
          },
          threadId: tid,
          history,
          userId,
          channelKey: channelKey,
        });
        try {
          engineRef.current?.dispatch({
            type: "MESSAGE_SEND_SUCCESS",
            threadId: tid,
            messageId,
          });
        } catch {
          /* empty */
        }
      } catch (err: unknown) {
        try {
          engineRef.current?.dispatch({
            type: "MESSAGE_SEND_FAILED",
            threadId: tid,
            messageId,
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {
          /* empty */
        }
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
    // Intentionally empty deps: run once on mount
  }, []);

  useEffect(() => {
    logger.log(AgentsEvents.StatusChanged, { status: engineStatus });
  }, [engineStatus, logger]);

  useEffect(() => {
    const s = engineRef.current?.getState();
    logger.log(AgentsEvents.ConnectionChanged, {
      connected: Boolean((s as { isConnected?: boolean })?.isConnected),
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
    messages: engineMessages || [],
    status: (engineStatus as AgentStatus) ?? "ready",
    isConnected: Boolean(engineRef.current?.getState().isConnected),
    currentAgent: undefined,
    error: undefined,
    clearError: () => {
      const tid = currentThreadId || fallbackThreadIdRef.current!;
      try {
        engineRef.current?.dispatch({
          type: "CLEAR_THREAD_ERROR",
          threadId: tid,
        });
      } catch {
        /* empty */
      }
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
          : JSON.stringify(threadsQuery.error)
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
      await effectiveTransport.cancelMessage({ threadId: tid });
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
        });
      } catch {
        /* empty */
      }
    },
    replaceThreadMessages: (
      threadId: string,
      messages: ConversationMessage<TManifest, TState>[]
    ) => {
      try {
        engineRef.current?.dispatch({
          type: "REPLACE_THREAD_MESSAGES",
          threadId,
          messages,
        });
      } catch {
        /* empty */
      }
    },

    // Thread CRUD
    deleteThread: async (threadId: string) => {
      await deleteThreadFn(threadId);
      try {
        if (hasQueryProvider && queryClient) {
          queryClient.setQueryData(
            ["useAgents", "threads", identityKey],
            (old: { pages?: ThreadsPage[] } | undefined) => {
              if (!old) return old;
              const pages = (old.pages || []).map((p) => ({
                ...p,
                threads: (p.threads || []).filter((t) => t.id !== threadId),
              }));
              return { ...old, pages } as { pages: ThreadsPage[] };
            }
          );
        } else {
          setThreadsLocal((prev: Thread[]) =>
            prev.filter((t: Thread) => t.id !== threadId)
          );
        }
      } catch {
        /* empty */
      }
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
          return tm.mergeThreadsPreserveOrder(prev, data.threads || []);
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
        });
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
  } satisfies UseAgentsReturn<TManifest, TState>;
}
