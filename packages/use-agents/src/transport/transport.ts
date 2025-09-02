/**
 * AgentKit Transport System
 * 
 * Provides a configurable transport layer for all agent-related API calls.
 * Allows users to customize endpoints, headers, and request logic while
 * maintaining a consistent interface across all hooks.
 */

import { ConversationMessage, Thread, RealtimeToken, createAgentError, AgentError } from '../types/index.js';
import { type AgentKitMessage } from '../utils/message-formatting.js';

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
  history: AgentKitMessage[]; // Support full AgentKit message format including tool calls/results
  userId?: string;
  channelKey?: string; // NEW: Support channelKey for anonymous sessions
}

/**
 * Parameters for fetching threads list.
 */
export interface FetchThreadsParams {
  userId?: string;
  channelKey?: string; // NEW: Support channelKey for anonymous sessions
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
  userId?: string;
  channelKey?: string; // NEW: Support channelKey for anonymous sessions
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
  userId?: string;
  threadId?: string;
  channelKey?: string; // NEW: Flexible subscription channel
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
 * The core transport interface that all AgentKit React hooks use for API communication.
 * 
 * This interface abstracts all agent-related API operations, allowing for complete
 * customization of endpoints, request handling, and response processing while
 * maintaining a consistent contract across all hooks.
 * 
 * ## Purpose
 * 
 * - **Abstraction**: Decouples hooks from specific API implementations
 * - **Customization**: Allows custom endpoints, headers, authentication
 * - **Testing**: Enables easy mocking for unit tests
 * - **Flexibility**: Supports different backend architectures (REST, GraphQL, etc.)
 * 
 * ## Implementation Options
 * 
 * 1. **DefaultAgentTransport**: Built-in implementation for conventional REST APIs
 * 2. **Custom Implementation**: Implement this interface for custom backends
 * 3. **Transport Wrapping**: Use `createCustomTransport` to override specific methods
 * 
 * @interface AgentTransport
 * @example
 * ```typescript
 * // Custom transport for GraphQL backend
 * class GraphQLAgentTransport implements AgentTransport {
 *   async sendMessage(params) {
 *     const mutation = gql`
 *       mutation SendMessage($input: MessageInput!) {
 *         sendMessage(input: $input) { threadId success }
 *       }
 *     `;
 *     return await client.mutate({ mutation, variables: { input: params } });
 *   }
 *   
 *   async fetchThreads(params) {
 *     const query = gql`query GetThreads($userId: ID!, $limit: Int!) { ... }`;
 *     return await client.query({ query, variables: params });
 *   }
 *   
 *   // ... implement other methods
 * }
 * ```
 */
export interface AgentTransport {
  /**
   * Send a message to an agent and trigger AgentKit network execution.
   * 
   * This is the core method that starts a conversation turn. It sends the user's
   * message along with conversation history to AgentKit, which triggers the
   * agent network to process and respond via real-time streaming.
   * 
   * @param params - Message parameters including content, history, and context
   * @param options - Optional request customization (headers, body, signal)
   * @returns Promise resolving to success status and thread ID
   */
  sendMessage(
    params: SendMessageParams,
    options?: RequestOptions
  ): Promise<{ success: boolean; threadId: string }>;

  /**
   * Get a real-time subscription token for WebSocket streaming.
   * 
   * This method obtains a token that allows the client to establish a WebSocket
   * connection to receive real-time events from AgentKit networks. The token
   * includes channel information and authentication for secure streaming.
   * 
   * @param params - Token parameters including user/thread/channel context
   * @param options - Optional request customization
   * @returns Promise resolving to a streaming token with channel info
   */
  getRealtimeToken(
    params: GetRealtimeTokenParams,
    options?: RequestOptions
  ): Promise<RealtimeToken>;

  /**
   * Fetch a paginated list of conversation threads.
   * 
   * Retrieves threads with metadata including titles, message counts, and timestamps.
   * Supports both user-based queries (for authenticated users) and channel-based
   * queries (for anonymous sessions).
   * 
   * @param params - Query parameters including user/channel, pagination
   * @param options - Optional request customization
   * @returns Promise resolving to threads list with pagination info
   */
  fetchThreads(
    params: FetchThreadsParams,
    options?: RequestOptions
  ): Promise<{ threads: Thread[]; hasMore: boolean; total: number }>;

  /**
   * Fetch the complete message history for a specific thread.
   * 
   * Returns raw database messages that need to be converted to UI format.
   * Used by thread switching logic to load historical conversation context.
   * 
   * @param params - Parameters including the thread ID to fetch
   * @param options - Optional request customization
   * @returns Promise resolving to array of raw database messages
   */
  fetchHistory(
    params: FetchHistoryParams,
    options?: RequestOptions
  ): Promise<any[]>; // Raw database messages

  /**
   * Create a new conversation thread.
   * 
   * Initializes a new thread in the backend storage with metadata.
   * Used by optimistic thread creation and explicit thread creation flows.
   * 
   * @param params - Thread creation parameters including user context
   * @param options - Optional request customization
   * @returns Promise resolving to new thread ID and initial title
   */
  createThread(
    params: CreateThreadParams,
    options?: RequestOptions
  ): Promise<{ threadId: string; title: string }>;

  /**
   * Delete a conversation thread and all its messages permanently.
   * 
   * Removes the thread and all associated messages from storage.
   * This operation is typically irreversible, so UIs should confirm before calling.
   * 
   * @param params - Thread deletion parameters including thread ID
   * @param options - Optional request customization
   * @returns Promise that resolves when deletion is complete
   */
  deleteThread(
    params: DeleteThreadParams,
    options?: RequestOptions
  ): Promise<void>;

  /**
   * Approve or deny a tool call in Human-in-the-Loop (HITL) workflows.
   * 
   * Used when AgentKit agents request human approval before executing
   * potentially sensitive or destructive operations. The approval/denial
   * is sent back to the running agent to continue or abort the operation.
   * 
   * @param params - Approval parameters including tool call ID and action
   * @param options - Optional request customization
   * @returns Promise that resolves when approval is processed
   */
  approveToolCall(
    params: ApproveToolCallParams,
    options?: RequestOptions
  ): Promise<void>;

  /**
   * Cancel a message/run that's currently in progress (optional).
   * 
   * Attempts to stop an ongoing AgentKit execution. Not all transports
   * may support cancellation, so this method is optional.
   * 
   * @param params - Cancellation parameters including thread ID
   * @param options - Optional request customization
   * @returns Promise that resolves when cancellation is processed
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
 * Default HTTP-based transport implementation for AgentKit React hooks.
 * 
 * This class provides a production-ready transport that works with conventional
 * REST API endpoints. It includes intelligent defaults for Next.js applications
 * while remaining fully configurable for custom setups.
 * 
 * ## Features
 * 
 * - **Conventional Defaults**: Works with standard `/api/chat`, `/api/threads` routes
 * - **Template URLs**: Supports `{param}` placeholders in endpoint URLs
 * - **Configurable Headers**: Custom authentication and request headers
 * - **Error Handling**: Rich error objects with recovery guidance
 * - **Request Customization**: Per-request header and body overrides
 * 
 * ## Default Endpoints
 * 
 * - `sendMessage`: `POST /api/chat`
 * - `getRealtimeToken`: `POST /api/realtime/token`
 * - `fetchThreads`: `GET /api/threads`
 * - `fetchHistory`: `GET /api/threads/{threadId}`
 * - `createThread`: `POST /api/threads`
 * - `deleteThread`: `DELETE /api/threads/{threadId}`
 * - `approveToolCall`: `POST /api/approve-tool`
 * - `cancelMessage`: `POST /api/chat/cancel`
 * 
 * @example
 * ```typescript
 * // Use with default configuration
 * const transport = createDefaultAgentTransport();
 * 
 * // Custom configuration
 * const customTransport = createDefaultAgentTransport({
 *   api: {
 *     sendMessage: '/api/v2/agent/message',
 *     fetchThreads: '/api/v2/conversations',
 *     deleteThread: '/api/v2/conversations/{threadId}/delete'
 *   },
 *   headers: {
 *     'Authorization': `Bearer ${token}`,
 *     'X-API-Version': '2.0'
 *   },
 *   baseURL: 'https://api.myapp.com'
 * });
 * ```
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
      
      // Create enhanced error with recovery guidance
      const agentError = createAgentError(response, `Request to ${endpoint}`);
      // Override message with more detailed info if available
      if (errorMessage !== `HTTP ${response.status}: ${response.statusText}`) {
        agentError.message = errorMessage;
      }
      
      throw agentError;
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
        channelKey: params.channelKey, // NEW: Pass channelKey for anonymous sessions
        ...options?.body,
      },
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  async getRealtimeToken(
    params: GetRealtimeTokenParams,
    options?: RequestOptions
  ): Promise<RealtimeToken> {
    const endpoint = await this.resolveOption(this.config.api.getRealtimeToken);
    
    const response = await this.makeRequest<RealtimeToken>(endpoint, {}, {
      method: 'POST',
      body: {
        userId: params.userId,
        threadId: params.threadId,
        channelKey: params.channelKey, // NEW: Pass channelKey to backend
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
  ): Promise<{ threads: Thread[]; hasMore: boolean; total: number }> {
    const endpoint = await this.resolveOption(this.config.api.fetchThreads);
    
    // Build query parameters - support both userId and channelKey
    const queryParams = new URLSearchParams({
      limit: (params.limit || 20).toString(),
      offset: (params.offset || 0).toString(),
    });
    
    // Add userId or channelKey to query params
    if (params.userId) {
      queryParams.set('userId', params.userId);
    } else if (params.channelKey) {
      queryParams.set('channelKey', params.channelKey);
    }

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
        channelKey: params.channelKey, // NEW: Pass channelKey for anonymous sessions
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
