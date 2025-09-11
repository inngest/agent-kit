/**
 * HTTP Transport Adapter (Hex Adapter)
 *
 * Implementation of IClientTransport using conventional HTTP endpoints.
 * This file lives under adapters/ to align with hexagonal architecture.
 */

import {
  type Thread,
  type RealtimeToken,
  type AgentError,
  createAgentError,
} from "../../types/index";
import type {
  IClientTransport,
  RequestOptions,
  SendMessageParams,
  FetchThreadsParams,
  FetchHistoryParams,
  CreateThreadParams,
  DeleteThreadParams,
  GetRealtimeTokenParams,
  ApproveToolCallParams,
} from "../ports/transport";

// =============================================================================
// DEFAULT TRANSPORT IMPLEMENTATION
// =============================================================================

/**
 * Configuration for the default transport implementation.
 */
export interface DefaultHttpTransportConfig {
  /**
   * API endpoint configurations. Can be strings or functions that return strings.
   * String templates support {param} replacement (e.g., '/api/threads/{threadId}').
   */
  api: {
    sendMessage: string | (() => string | Promise<string>);
    getRealtimeToken: string | (() => string | Promise<string>);
    fetchThreads: string | (() => string | Promise<string>);
    fetchHistory: string | (() => string | Promise<string>); // e.g., '/api/threads/{threadId}'
    createThread: string | (() => string | Promise<string>);
    deleteThread: string | (() => string | Promise<string>); // e.g., '/api/threads/{threadId}'
    approveToolCall: string | (() => string | Promise<string>);
    cancelMessage?: string | (() => string | Promise<string>); // e.g., '/api/chat/cancel'
  };

  /**
   * Default headers to include with all requests.
   */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);

  /**
   * Default body fields to include with all requests.
   */
  body?:
    | Record<string, unknown>
    | (() => Record<string, unknown> | Promise<Record<string, unknown>>);

  /**
   * Base URL for all endpoints (optional).
   */
  baseURL?: string;

  /**
   * Custom fetch function (for testing or custom request handling).
   */
  fetch?: typeof fetch;
}

/**
 * Default HTTP-based transport implementation for AgentKit React hooks.
 */
export class DefaultHttpTransport implements IClientTransport {
  private config: DefaultHttpTransportConfig;
  private fetchFn: typeof fetch;

  constructor(config?: Partial<DefaultHttpTransportConfig>) {
    this.config = {
      api: {
        sendMessage: "/api/chat",
        getRealtimeToken: "/api/realtime/token",
        fetchThreads: "/api/threads",
        fetchHistory: "/api/threads/{threadId}",
        createThread: "/api/threads",
        deleteThread: "/api/threads/{threadId}",
        approveToolCall: "/api/approve-tool",
        cancelMessage: "/api/chat/cancel",
      },
      headers: {
        "Content-Type": "application/json",
      },
      baseURL: "",
      ...config,
    } as DefaultHttpTransportConfig;

    this.fetchFn =
      this.config.fetch ||
      ((url: string | URL | Request, init?: RequestInit) => fetch(url, init));
  }

  private async resolveOption<T>(
    option: T | (() => T | Promise<T>)
  ): Promise<T> {
    if (typeof option === "function") {
      return await (option as () => T | Promise<T>)();
    }
    return option;
  }

  private buildURL(
    template: string,
    params: Record<string, string> = {}
  ): string {
    let url = template;
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    }
    if (this.config.baseURL && !url.startsWith("http")) {
      url = `${this.config.baseURL.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
    }
    return url;
  }

  private async makeRequest<T>(
    endpoint: string,
    params: Record<string, string> = {},
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const url = this.buildURL(endpoint, params);
    const defaultHeaders = await this.resolveOption(this.config.headers || {});
    const defaultBody = await this.resolveOption(this.config.body || {});

    const headers = { ...defaultHeaders, ...options.headers };

    let body: string | undefined;
    if (options.body) {
      body =
        typeof options.body === "string"
          ? options.body
          : JSON.stringify({ ...defaultBody, ...options.body });
    } else if (options.method !== "GET" && options.method !== "DELETE") {
      body = JSON.stringify(defaultBody);
    }

    const response = await this.fetchFn(url, {
      method: options.method || "GET",
      headers,
      body,
      signal: options.signal,
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const data = (await response.json()) as unknown;
        if (data && typeof data === "object") {
          const anyData = data as Record<string, unknown>;
          const err = anyData.error as Record<string, unknown> | undefined;
          const detail =
            (err?.message as string) || (anyData.message as string);
          if (typeof detail === "string" && detail.length > 0) {
            message = detail;
          }
        }
      } catch {
        // ignore JSON parsing errors; fallback to default message
      }
      const agentError = createAgentError(response, `Request to ${endpoint}`);
      if (message) (agentError as { message: string }).message = message;
      interface ErrorWithAgentError extends Error {
        agentError: AgentError;
      }
      const err: ErrorWithAgentError = new Error(
        (agentError as { message: string }).message
      ) as ErrorWithAgentError;
      err.agentError = agentError;
      throw err;
    }
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async sendMessage(
    params: SendMessageParams,
    options?: RequestOptions
  ): Promise<{ success: boolean; threadId: string }> {
    const endpoint = await this.resolveOption(this.config.api.sendMessage);
    return this.makeRequest(
      endpoint,
      {},
      {
        method: "POST",
        body: {
          userMessage: params.userMessage,
          threadId: params.threadId,
          history: params.history,
          userId: params.userId,
          channelKey: params.channelKey,
          ...options?.body,
        },
        headers: options?.headers,
        signal: options?.signal,
      }
    );
  }

  async getRealtimeToken(
    params: GetRealtimeTokenParams,
    options?: RequestOptions
  ): Promise<RealtimeToken> {
    const endpoint = await this.resolveOption(this.config.api.getRealtimeToken);
    return this.makeRequest<RealtimeToken>(
      endpoint,
      {},
      {
        method: "POST",
        body: {
          userId: params.userId,
          threadId: params.threadId,
          channelKey: params.channelKey,
          ...options?.body,
        },
        headers: options?.headers,
        signal: options?.signal,
      }
    );
  }

  async fetchThreads(
    params: FetchThreadsParams,
    options?: RequestOptions
  ): Promise<{
    threads: Thread[];
    hasMore: boolean;
    total: number;
    nextCursorTimestamp?: string | null;
    nextCursorId?: string | null;
  }> {
    const endpoint = await this.resolveOption(this.config.api.fetchThreads);
    const queryParams = new URLSearchParams({
      limit: String(params.limit || 20),
    });
    if (params.cursorTimestamp && params.cursorId) {
      queryParams.set("cursorTimestamp", params.cursorTimestamp);
      queryParams.set("cursorId", params.cursorId);
    } else if (typeof params.offset === "number") {
      queryParams.set("offset", String(params.offset));
    }
    if (params.userId) queryParams.set("userId", params.userId);
    else if (params.channelKey)
      queryParams.set("channelKey", params.channelKey);
    const url = `${endpoint}?${queryParams}`;
    return this.makeRequest(
      url,
      {},
      { method: "GET", headers: options?.headers, signal: options?.signal }
    );
  }

  async fetchHistory(
    params: FetchHistoryParams,
    options?: RequestOptions
  ): Promise<unknown[]> {
    const endpoint = await this.resolveOption(this.config.api.fetchHistory);
    const response = await this.makeRequest<{ messages: unknown[] }>(
      endpoint,
      { threadId: params.threadId },
      {
        method: "GET",
        headers: options?.headers,
        signal: options?.signal,
      }
    );
    return response.messages;
  }

  async createThread(
    params: CreateThreadParams,
    options?: RequestOptions
  ): Promise<{ threadId: string; title: string }> {
    const endpoint = await this.resolveOption(this.config.api.createThread);
    return this.makeRequest(
      endpoint,
      {},
      {
        method: "POST",
        body: {
          userId: params.userId,
          channelKey: params.channelKey,
          title: params.title,
          metadata: params.metadata,
          ...options?.body,
        },
        headers: options?.headers,
        signal: options?.signal,
      }
    );
  }

  async deleteThread(
    params: DeleteThreadParams,
    options?: RequestOptions
  ): Promise<void> {
    const endpoint = await this.resolveOption(this.config.api.deleteThread);
    await this.makeRequest<void>(
      endpoint,
      { threadId: params.threadId },
      { method: "DELETE", headers: options?.headers, signal: options?.signal }
    );
  }

  async approveToolCall(
    params: ApproveToolCallParams,
    options?: RequestOptions
  ): Promise<void> {
    const endpoint = await this.resolveOption(this.config.api.approveToolCall);
    await this.makeRequest<void>(
      endpoint,
      {},
      {
        method: "POST",
        body: {
          toolCallId: params.toolCallId,
          threadId: params.threadId,
          action: params.action,
          reason: params.reason,
          ...options?.body,
        },
        headers: options?.headers,
        signal: options?.signal,
      }
    );
  }

  async cancelMessage(
    params: { threadId: string },
    options?: RequestOptions
  ): Promise<void> {
    const cancelEndpoint = this.config.api.cancelMessage;
    if (!cancelEndpoint)
      throw new Error("cancelMessage endpoint not configured");
    const endpoint = await this.resolveOption(cancelEndpoint);
    await this.makeRequest<void>(
      endpoint,
      {},
      {
        method: "POST",
        body: { threadId: params.threadId, ...options?.body },
        headers: options?.headers,
        signal: options?.signal,
      }
    );
  }
}

export function createDefaultHttpTransport(
  config?: Partial<DefaultHttpTransportConfig>
): DefaultHttpTransport {
  return new DefaultHttpTransport(config);
}

export function createCustomTransport(
  baseTransport: IClientTransport,
  overrides: Partial<IClientTransport>
): IClientTransport {
  return { ...baseTransport, ...overrides };
}
