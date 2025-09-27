import type {
  ConversationMessage,
  AgentStatus,
  Thread,
  AgentError,
  AgentKitEvent,
  ToolManifest,
  TypedToolResult,
} from "../../../../types/index.js";
import type { IClientTransport } from "../../../../core/ports/transport.js";

/**
 * Configuration for the unified useAgents hook.
 * Extends the existing useChat configuration for full compatibility.
 */
export type OnEventMeta = {
  threadId?: string;
  runId?: string;
  scope?: "network" | "agent";
  messageId?: string;
  source?: "ws" | "bc" | "unknown";
};

export type UseAgentsConfig<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
> = {
  userId?: string;
  channelKey?: string;
  initialThreadId?: string;
  debug?: boolean;
  /**
   * Low-level callback invoked for every normalized realtime event processed by the hook.
   * Useful for driving UI directly from events (thinking indicators, tool states, etc.).
   */
  onEvent?: (evt: AgentKitEvent<TManifest>, meta: OnEventMeta) => void;
  /**
   * Optional callback fired when a terminal stream event is received.
   * Triggers on either "stream.ended" or "run.completed" for the thread.
   */
  onStreamEnded?: (args: {
    threadId: string;
    messageId?: string;
    runId?: string;
    scope?: "network" | "agent";
  }) => void;
  /** Optional, strongly-typed callback for tool results */
  onToolResult?: (result: TypedToolResult<TManifest>) => void;
  /**
   * Page size for thread pagination (used by initial load, infinite query, and refresh).
   * Defaults to 20 when not provided.
   */
  threadsPageSize?: number;
  /** Optional transport instance to override provider/default transport */
  transport?: IClientTransport;
  /**
   * If true, throws when used outside of an AgentProvider. When false (default),
   * the hook will create a local streaming instance as a fallback.
   */
  requireProvider?: boolean;
  enableThreadValidation?: boolean;
  onThreadNotFound?: (threadId: string) => void;
  state?: () => TState;
  onStateRehydrate?: (messageState: TState, messageId: string) => void;
  fetchThreads?: (
    userId: string,
    pagination:
      | { limit: number; offset: number }
      | { limit: number; cursorTimestamp: string; cursorId: string }
  ) => Promise<{
    threads: Thread[];
    hasMore: boolean;
    total: number;
    nextCursorTimestamp?: string | null;
    nextCursorId?: string | null;
  }>;
  fetchHistory?: (threadId: string) => Promise<unknown[]>;
  createThread?: (
    userId: string
  ) => Promise<{ threadId: string; title: string }>;
  deleteThread?: (threadId: string) => Promise<void>;
  renameThread?: (threadId: string, title: string) => Promise<void>;
};

/**
 * Return type for the unified useAgents hook.
 * Currently aligns 1:1 with UseChatReturn to ensure a non-breaking migration path.
 */
export type UseAgentsReturn<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
> = {
  // Agent state
  messages: ConversationMessage<TManifest, TState>[];
  status: AgentStatus;
  isConnected: boolean;
  currentAgent?: string;
  error?: AgentError;
  clearError: () => void;

  // Thread state
  threads: Thread[];
  threadsLoading: boolean;
  threadsHasMore: boolean;
  threadsError: string | null;
  currentThreadId: string | null;

  // Loading
  isLoadingInitialThread: boolean;

  // Unified actions
  sendMessage: (
    message: string,
    options?: { messageId?: string }
  ) => Promise<void>;
  sendMessageToThread: (
    threadId: string,
    message: string,
    options?: {
      messageId?: string;
      state?: TState | (() => TState);
    }
  ) => Promise<void>;
  cancel: () => Promise<void>;
  approveToolCall: (toolCallId: string, reason?: string) => Promise<void>;
  denyToolCall: (toolCallId: string, reason?: string) => Promise<void>;

  // Thread navigation
  switchToThread: (threadId: string) => Promise<void>;
  setCurrentThreadId: (threadId: string) => void;

  // Advanced thread operations
  loadThreadHistory: (
    threadId: string
  ) => Promise<ConversationMessage<TManifest, TState>[]>;
  clearThreadMessages: (threadId: string) => void;
  replaceThreadMessages: (
    threadId: string,
    messages: ConversationMessage<TManifest, TState>[]
  ) => void;

  // Thread CRUD
  deleteThread: (threadId: string) => Promise<void>;
  loadMoreThreads: () => Promise<void>;
  refreshThreads: () => Promise<void>;

  // Thread creation
  createNewThread: () => string;

  // Message editing
  rehydrateMessageState: (messageId: string) => void;
};
