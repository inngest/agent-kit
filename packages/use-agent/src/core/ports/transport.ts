// Framework-agnostic transport port: re-export the client transport type for now
// This provides a stable hexagonal port surface which we can evolve independently

// Port interface surface for transports
import type { RealtimeToken, ThreadsPage } from "../../types/index.js";
export interface RequestOptions {
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface SendMessageParams {
  userMessage: {
    id: string;
    content: string;
    role: "user";
    state?: Record<string, unknown>;
    clientTimestamp?: Date;
    systemPrompt?: string;
  };
  threadId: string;
  history: unknown[];
  userId?: string;
  channelKey?: string;
}

export interface FetchThreadsParams {
  userId?: string;
  channelKey?: string;
  limit?: number;
  cursorTimestamp?: string;
  cursorId?: string;
  offset?: number;
}

export interface FetchHistoryParams {
  threadId: string;
}
export interface CreateThreadParams {
  userId?: string;
  channelKey?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}
export interface DeleteThreadParams {
  threadId: string;
}
export interface GetRealtimeTokenParams {
  userId?: string;
  threadId?: string;
  channelKey?: string;
}
export interface ApproveToolCallParams {
  toolCallId: string;
  threadId: string;
  action: "approve" | "deny";
  reason?: string;
}

export interface IClientTransport {
  sendMessage(
    params: SendMessageParams,
    options?: RequestOptions
  ): Promise<{ success: boolean; threadId: string }>;
  getRealtimeToken(
    params: GetRealtimeTokenParams,
    options?: RequestOptions
  ): Promise<RealtimeToken>;
  fetchThreads(
    params: FetchThreadsParams,
    options?: RequestOptions
  ): Promise<ThreadsPage>;
  fetchHistory(
    params: FetchHistoryParams,
    options?: RequestOptions
  ): Promise<unknown[]>;
  createThread(
    params: CreateThreadParams,
    options?: RequestOptions
  ): Promise<{ threadId: string; title: string }>;
  deleteThread(
    params: DeleteThreadParams,
    options?: RequestOptions
  ): Promise<void>;
  approveToolCall(
    params: ApproveToolCallParams,
    options?: RequestOptions
  ): Promise<void>;
  cancelMessage?(
    params: { threadId: string },
    options?: RequestOptions
  ): Promise<void>;
}
