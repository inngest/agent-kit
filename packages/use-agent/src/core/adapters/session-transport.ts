import type {
  IClientTransport,
  SendMessageParams,
  RequestOptions,
  FetchThreadsParams,
  // FetchHistoryParams,
  CreateThreadParams,
  DeleteThreadParams,
  ApproveToolCallParams,
  GetRealtimeTokenParams,
} from "../ports/transport.js";
import type { Thread } from "../../types/index.js";
import {
  DefaultHttpTransport,
  type DefaultHttpTransportConfig,
} from "./http-transport";

// Module-level in-memory store (per-tab, non-persistent)
const threadsByUser: Map<string, Thread[]> = new Map();

function getUserKey(userId?: string | null): string {
  return userId || "anon";
}

/**
 * In-memory session transport for demos and offline/ephemeral mode.
 * - No persistence (purely in-memory, per-tab)
 * - Delegates runtime actions (sendMessage, realtime token, approvals) to HTTP transport
 * - Handles thread CRUD and history locally
 */
export class InMemorySessionTransport implements IClientTransport {
  private readonly http: IClientTransport;

  constructor(config?: Partial<DefaultHttpTransportConfig>) {
    this.http = new DefaultHttpTransport(config);
  }

  // Delegate to HTTP to initiate agent runs
  async sendMessage(
    params: SendMessageParams,
    options?: RequestOptions
  ): Promise<{ success: boolean; threadId: string }> {
    return this.http.sendMessage(params, options);
  }

  // Delegate to HTTP to obtain a realtime subscription token
  async getRealtimeToken(
    params: GetRealtimeTokenParams,
    options?: RequestOptions
  ): Promise<{ token: string; expires?: number }> {
    return this.http.getRealtimeToken(params, options);
  }

  // Ephemeral, per-tab thread list
  fetchThreads(params: FetchThreadsParams): Promise<{
    threads: Thread[];
    hasMore: boolean;
    total: number;
    nextCursorTimestamp?: string | null;
    nextCursorId?: string | null;
  }> {
    const key = getUserKey(params.userId);
    const list = threadsByUser.get(key) || [];
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;
    const slice = list.slice(offset, offset + limit);
    return Promise.resolve({
      threads: slice,
      hasMore: offset + limit < list.length,
      total: list.length,
    });
  }

  // No server history in ephemeral mode
  fetchHistory(): Promise<unknown[]> {
    return Promise.resolve([]);
  }

  createThread(
    params: CreateThreadParams
  ): Promise<{ threadId: string; title: string }> {
    const id = crypto.randomUUID?.() || String(Date.now());
    const now = new Date();
    const thread: Thread = {
      id,
      title: params.title || "New conversation",
      messageCount: 0,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    } as Thread;
    const key = getUserKey(params.userId);
    const list = threadsByUser.get(key) || [];
    threadsByUser.set(key, [thread, ...list]);
    return Promise.resolve({ threadId: id, title: thread.title });
  }

  deleteThread(params: DeleteThreadParams): Promise<void> {
    for (const [key, list] of threadsByUser) {
      threadsByUser.set(
        key,
        list.filter((t) => t.id !== params.threadId)
      );
    }
    return Promise.resolve();
  }

  // Delegate approvals to HTTP (optional on the backend)
  async approveToolCall(
    params: ApproveToolCallParams,
    options?: RequestOptions
  ): Promise<void> {
    return this.http.approveToolCall(params, options);
  }

  // Optional cancel passthrough if configured on backend
  async cancelMessage(
    params: { threadId: string },
    options?: RequestOptions
  ): Promise<void> {
    if (typeof this.http.cancelMessage === "function") {
      return this.http.cancelMessage(params, options);
    }
  }
}

export function createInMemorySessionTransport(
  config?: Partial<DefaultHttpTransportConfig>
): InMemorySessionTransport {
  return new InMemorySessionTransport(config);
}
