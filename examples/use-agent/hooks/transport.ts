/**
 * AgentKit Transport System
 * 
 * Provides a configurable transport layer for all agent-related API calls.
 * Allows users to customize endpoints, headers, and request logic while
 * maintaining a consistent interface across all hooks.
 */

import { ConversationMessage } from './use-agent';

// =============================================================================
// TRANSPORT INTERFACES
// =============================================================================

/**
 * Options for per-request customization (e.g., custom headers or body fields).
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  body?: Record<string, any>;
  signal?: AbortSignal; // For request cancellation
}

/**
 * Helper type for options that can be static or a function.
 */
type ConfigurableOption<T> = T | (() => T | Promise<T>);

/**
 * Parameters for sending a message to an agent.
 */
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
  history: Array<{ role: 'user' | 'assistant'; type: 'text'; content: string }>;
  userId?: string;
}

/**
 * Parameters for fetching threads list.
 */
export interface FetchThreadsParams {
  userId: string;
  limit?: number;
  offset?: number;
}

/**
 * Parameters for fetching thread history.
 */
export interface FetchHistoryParams {
  threadId: string;
}

/**
 * Parameters for creating a new thread.
 */
export interface CreateThreadParams {
  userId: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for deleting a thread.
 */
export interface DeleteThreadParams {
  threadId: string;
}

/**
 * Parameters for getting a real-time token.
 */
export interface GetRealtimeTokenParams {
  userId: string;
  threadId?: string;
}

/**
 * Parameters for approving/denying tool calls.
 */
export interface ApproveToolCallParams {
  toolCallId: string;
  threadId: string;
  action: 'approve' | 'deny';
  reason?: string;
}

/**
 * Thread data structure returned by the transport.
 * Note: This is also exported from use-threads.ts
 */
interface TransportThread {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  hasNewMessages?: boolean;
}

/**
 * The core transport interface that all transports must implement.
 * This defines the contract for all agent-related API operations.
 */
export interface AgentTransport {
  /**
   * Send a message to an agent and trigger processing.
   */
  sendMessage(
    params: SendMessageParams,
    options?: RequestOptions
  ): Promise<{ success: boolean; threadId: string }>;

  /**
   * Get a real-time subscription token for streaming agent responses.
   */
  getRealtimeToken(
    params: GetRealtimeTokenParams,
    options?: RequestOptions
  ): Promise<any>;

  /**
   * Fetch a paginated list of threads for a user.
   */
  fetchThreads(
    params: FetchThreadsParams,
    options?: RequestOptions
  ): Promise<{ threads: TransportThread[]; hasMore: boolean; total: number }>;

  /**
   * Fetch the message history for a specific thread.
   */
  fetchHistory(
    params: FetchHistoryParams,
    options?: RequestOptions
  ): Promise<any[]>; // Raw database messages

  /**
   * Create a new conversation thread.
   */
  createThread(
    params: CreateThreadParams,
    options?: RequestOptions
  ): Promise<{ threadId: string; title: string }>;

  /**
   * Delete a conversation thread and all its messages.
   */
  deleteThread(
    params: DeleteThreadParams,
    options?: RequestOptions
  ): Promise<void>;

  /**
   * Approve or deny a tool call (Human-in-the-Loop).
   */
  approveToolCall(
    params: ApproveToolCallParams,
    options?: RequestOptions
  ): Promise<void>;

  /**
   * Cancel a message/run that's currently in progress.
   */
  cancelMessage?(
    params: { threadId: string },
    options?: RequestOptions
  ): Promise<void>;
}

// =============================================================================
// DEFAULT TRANSPORT IMPLEMENTATION
// =============================================================================

/**
 * Configuration for the default transport implementation.
 */
export interface DefaultAgentTransportConfig {
  /**
   * API endpoint configurations. Can be strings or functions that return strings.
   * String templates support {param} replacement (e.g., '/api/threads/{threadId}').
   */
  api: {
    sendMessage: ConfigurableOption<string>;
    getRealtimeToken: ConfigurableOption<string>;
    fetchThreads: ConfigurableOption<string>;
    fetchHistory: ConfigurableOption<string>; // e.g., '/api/threads/{threadId}'
    createThread: ConfigurableOption<string>;
    deleteThread: ConfigurableOption<string>; // e.g., '/api/threads/{threadId}'
    approveToolCall: ConfigurableOption<string>;
    cancelMessage?: ConfigurableOption<string>; // e.g., '/api/chat/cancel'
  };
  
  /**
   * Default headers to include with all requests.
   */
  headers?: ConfigurableOption<Record<string, string>>;
  
  /**
   * Default body fields to include with all requests.
   */
  body?: ConfigurableOption<Record<string, any>>;

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
 * Default transport implementation that uses fetch to make HTTP requests.
 * Provides sensible defaults for Next.js applications but is fully configurable.
 */
export class DefaultAgentTransport implements AgentTransport {
  private config: DefaultAgentTransportConfig;
  private fetchFn: typeof fetch;

  constructor(config?: Partial<DefaultAgentTransportConfig>) {
    // Set up default configuration
    this.config = {
      api: {
        sendMessage: '/api/chat',
        getRealtimeToken: '/api/realtime/token',
        fetchThreads: '/api/threads',
        fetchHistory: '/api/threads/{threadId}',
        createThread: '/api/threads',
        deleteThread: '/api/threads/{threadId}',
        approveToolCall: '/api/approve-tool',
        cancelMessage: '/api/chat/cancel',
      },
      headers: {
        'Content-Type': 'application/json',
      },
      baseURL: '',
      ...config,
    };

    // Fix: Properly bind the fetch function to maintain context
    this.fetchFn = this.config.fetch || ((url: string | URL | Request, init?: RequestInit) => {
      return fetch(url, init);
    });
  }

  /**
   * Resolve a configurable option to its actual value.
   */
  private async resolveOption<T>(option: ConfigurableOption<T>): Promise<T> {
    if (typeof option === 'function') {
      return await (option as () => T | Promise<T>)();
    }
    return option;
  }

  /**
   * Build a URL from a template, replacing {param} placeholders.
   */
  private buildURL(template: string, params: Record<string, string> = {}): string {
    let url = template;
    
    // Replace {param} placeholders
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    }

    // Prepend base URL if configured
    if (this.config.baseURL && !url.startsWith('http')) {
      url = `${this.config.baseURL.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    return url;
  }

  /**
   * Make an HTTP request with merged headers and body.
   */
  private async makeRequest<T>(
    endpoint: string,
    params: Record<string, string> = {},
    options: {
      method?: string;
      body?: any;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const url = this.buildURL(endpoint, params);
    
    // Resolve configurable headers and body
    const defaultHeaders = await this.resolveOption(this.config.headers || {});
    const defaultBody = await this.resolveOption(this.config.body || {});

    // Merge headers
    const headers = {
      ...defaultHeaders,
      ...options.headers,
    };

    // Prepare request body
    let body: string | undefined;
    if (options.body) {
      if (typeof options.body === 'string') {
        body = options.body;
      } else {
        body = JSON.stringify({
          ...defaultBody,
          ...options.body,
        });
      }
    } else if (options.method !== 'GET' && options.method !== 'DELETE') {
      body = JSON.stringify(defaultBody);
    }

    const response = await this.fetchFn(url, {
      method: options.method || 'GET',
      headers,
      body,
      signal: options.signal,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch {
        // Ignore JSON parse errors, use default message
      }
      throw new Error(errorMessage);
    }

    // Handle empty responses (like DELETE operations)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return response.json();
  }

  // =============================================================================
  // TRANSPORT INTERFACE IMPLEMENTATION
  // =============================================================================

  async sendMessage(
    params: SendMessageParams,
    options?: RequestOptions
  ): Promise<{ success: boolean; threadId: string }> {
    const endpoint = await this.resolveOption(this.config.api.sendMessage);
    
    return this.makeRequest(endpoint, {}, {
      method: 'POST',
      body: {
        userMessage: params.userMessage,
        threadId: params.threadId,
        history: params.history,
        userId: params.userId,
        ...options?.body,
      },
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  async getRealtimeToken(
    params: GetRealtimeTokenParams,
    options?: RequestOptions
  ): Promise<any> {
    const endpoint = await this.resolveOption(this.config.api.getRealtimeToken);
    
    const response = await this.makeRequest<any>(endpoint, {}, {
      method: 'POST',
      body: {
        userId: params.userId,
        threadId: params.threadId,
        ...options?.body,
      },
      headers: options?.headers,
      signal: options?.signal,
    });

    return response;
  }

  async fetchThreads(
    params: FetchThreadsParams,
    options?: RequestOptions
  ): Promise<{ threads: TransportThread[]; hasMore: boolean; total: number }> {
    const endpoint = await this.resolveOption(this.config.api.fetchThreads);
    
    // Build query parameters
    const queryParams = new URLSearchParams({
      userId: params.userId,
      limit: (params.limit || 20).toString(),
      offset: (params.offset || 0).toString(),
    });

    const url = `${endpoint}?${queryParams}`;
    
    return this.makeRequest(url, {}, {
      method: 'GET',
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  async fetchHistory(
    params: FetchHistoryParams,
    options?: RequestOptions
  ): Promise<any[]> {
    const endpoint = await this.resolveOption(this.config.api.fetchHistory);
    
    const response = await this.makeRequest<{ messages: any[] }>(
      endpoint,
      { threadId: params.threadId },
      {
        method: 'GET',
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
    
    return this.makeRequest(endpoint, {}, {
      method: 'POST',
      body: {
        userId: params.userId,
        title: params.title,
        metadata: params.metadata,
        ...options?.body,
      },
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  async deleteThread(
    params: DeleteThreadParams,
    options?: RequestOptions
  ): Promise<void> {
    const endpoint = await this.resolveOption(this.config.api.deleteThread);
    
    await this.makeRequest<void>(
      endpoint,
      { threadId: params.threadId },
      {
        method: 'DELETE',
        headers: options?.headers,
        signal: options?.signal,
      }
    );
  }

  async approveToolCall(
    params: ApproveToolCallParams,
    options?: RequestOptions
  ): Promise<void> {
    const endpoint = await this.resolveOption(this.config.api.approveToolCall);
    
    await this.makeRequest<void>(endpoint, {}, {
      method: 'POST',
      body: {
        toolCallId: params.toolCallId,
        threadId: params.threadId,
        action: params.action,
        reason: params.reason,
        ...options?.body,
      },
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  async cancelMessage(
    params: { threadId: string },
    options?: RequestOptions
  ): Promise<void> {
    const cancelEndpoint = this.config.api.cancelMessage;
    if (!cancelEndpoint) {
      throw new Error('cancelMessage endpoint not configured');
    }

    const endpoint = await this.resolveOption(cancelEndpoint);
    
    await this.makeRequest<void>(endpoint, {}, {
      method: 'POST',
      body: {
        threadId: params.threadId,
        ...options?.body,
      },
      headers: options?.headers,
      signal: options?.signal,
    });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a default agent transport with optional configuration overrides.
 */
export function createDefaultAgentTransport(
  config?: Partial<DefaultAgentTransportConfig>
): DefaultAgentTransport {
  return new DefaultAgentTransport(config);
}

/**
 * Create a custom transport that overrides specific methods of an existing transport.
 */
export function createCustomTransport(
  baseTransport: AgentTransport,
  overrides: Partial<AgentTransport>
): AgentTransport {
  return {
    ...baseTransport,
    ...overrides,
  };
}
