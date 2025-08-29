# useAgent Hooks Package: Technical Specification

## 1. Objective

To refactor the existing `useAgent`, `useThreads`, and `useChat` hooks from the `use-agent` example into a standalone, framework-agnostic package. This package will be consumable in any React-based project (Next.js, Vite, etc.) and will be production-ready, configurable, and extensible.

## 2. Core Principles

- **Decoupling & Flexibility**: The hooks must be completely decoupled from any specific backend API structure, data-fetching library, or authentication mechanism.
- **Extensibility**: Provide clear "escape hatches" and lifecycle callbacks for developers to inject custom logic without forking the package.
- **Developer Experience (DX)**: The API should be intuitive, well-typed, and easy to debug. The primary `useChat` hook should be simple for basic use cases, while allowing for advanced configuration.

---

## Phase 1: Core Refactoring and API Design

### 3.1. Abstracting the API Layer

This is the most critical change. All hardcoded `fetch` calls must be removed and replaced with a flexible transport system.

#### Proposed Change: Class-based Transport System with Sensible Defaults

We will implement a formal, class-based transport system. The `useChat` hook will accept an optional `transport` instance for advanced use cases (like custom authentication) but will also work "zero-config" by using a default transport that assumes conventional API endpoints.

#### API Design & Implementation Details

**1. The `AgentTransport` Interface**

This interface defines the contract that all transports must implement.

```typescript
// Defines options for per-request customization (e.g., custom headers or body fields).
export interface RequestOptions {
  headers?: Record<string, string>;
  body?: Record<string, any>;
}

// The core interface that all transports must implement.
export interface AgentTransport {
  sendMessage(
    params: SendMessageParams,
    options?: RequestOptions
  ): Promise<{ threadId: string }>;
  getRealtimeToken(
    params: { userId: string; threadId: string },
    options?: RequestOptions
  ): Promise<string>;
  fetchThreads(
    params: FetchThreadsParams,
    options?: RequestOptions
  ): Promise<{ threads: Thread[]; hasMore: boolean }>;
  fetchHistory(
    params: { threadId: string },
    options?: RequestOptions
  ): Promise<ConversationMessage[]>;
  createThread(
    params: { userId: string },
    options?: RequestOptions
  ): Promise<{ threadId: string }>;
  deleteThread(
    params: { threadId: string },
    options?: RequestOptions
  ): Promise<void>;
}
```

**2. The `DefaultAgentTransport` Implementation**

This is our out-of-the-box implementation that makes `fetch` requests to user-defined API endpoints.

```typescript
// A helper type for options that can be static or a function.
type ConfigurableOption<T> = T | (() => T | Promise<T>);

// Configuration for the default transport.
export interface DefaultAgentTransportConfig {
  api: {
    sendMessage: string;
    getRealtimeToken: string;
    fetchThreads: string;
    fetchHistory: string; // e.g., '/api/threads/{threadId}'
    createThread: string;
    deleteThread: string; // e.g., '/api/threads/{threadId}'
  };
  headers?: ConfigurableOption<Record<string, string>>;
  body?: ConfigurableOption<Record<string, any>>;
}
```

**3. Integrating the Transport into `useChat`**

The `useChat` hook will be refactored to use this transport system with sensible defaults.

```typescript
export interface UseChatConfig {
  userId: string;
  // HIGHLIGHT: transport is now optional
  transport?: AgentTransport;
  // HIGHLIGHT: New optional prop for simple endpoint customization
  apiEndpoints?: Partial<DefaultAgentTransportConfig['api']>;
  // ... other configs
}

export const useChat = (config: UseChatConfig) => {
  const { transport, apiEndpoints, userId, ... } = config;

  // Use a memoized transport to avoid re-creation on every render
  const memoizedTransport = useMemo(() => {
    // 1. If the user provides a custom transport, use it.
    if (transport) {
      return transport;
    }

    // 2. If no transport is provided, create a DefaultAgentTransport.
    // Use the user-provided endpoints or fall back to conventional defaults.
    return new DefaultAgentTransport({
      api: {
        sendMessage: apiEndpoints?.sendMessage ?? '/api/chat',
        getRealtimeToken: apiEndpoints?.getRealtimeToken ?? '/api/realtime/token',
        fetchThreads: apiEndpoints?.fetchThreads ?? '/api/threads',
        fetchHistory: apiEndpoints?.fetchHistory ?? '/api/threads/{threadId}',
        createThread: apiEndpoints?.createThread ?? '/api/threads',
        deleteThread: apiEndpoints?.deleteThread ?? '/api/threads/{threadId}',
        ...apiEndpoints, // User overrides take precedence
      }
    });
  }, [transport, apiEndpoints]);

  const sendMessage = useCallback(async (message: string) => {
    await memoizedTransport.sendMessage({ message, ... });
  }, [memoizedTransport, ...]);

  // ...
};
```

### 3.2. User & Session Management

The `userId` will become a mandatory, top-level prop in the `useChat` configuration.

### 3.3. State Management & Initial Data Hydration

The `useChat` hook will accept optional `initialThreads` and `initialMessages` props to support Server-Side Rendering (SSR).

### 3.4. Lifecycle Callbacks & Event Handling

Introduce a rich set of optional callback functions (`onSendMessage`, `onReceiveMessage`, etc.) in the `useChat` configuration for key events.

### 3.5. Enhanced UI Control & State Management

We will add several new features to the `useChat` hook to give developers more fine-grained control.

#### 3.5.1. Direct State Manipulation (`setMessages`)

We will expose a `setMessages` function directly from the `useChat` hook. This provides a powerful escape hatch for developers to directly manipulate the client-side message state for things like optimistic deletes or local filtering.

**API Design:**

```typescript
// Exposed from useChat
const { messages, setMessages, ... } = useChat(...);

const handleDeleteMessage = (messageId: string) => {
  const newMessages = messages.filter(m => m.id !== messageId);
  setMessages(newMessages); // Update the state
}
```

#### 3.5.2. Message Regeneration (`regenerate`)

This function provides a simple way to re-run the last user prompt. The `useChat` hook will expose a `regenerate` function that finds the last user message in the current thread and calls `sendMessage()` with its content.

#### 3.5.3. Descriptive Status Enum

To enable more nuanced UI feedback, we will expand the `AgentStatus` enum.

**Proposed Change:**

```typescript
export type AgentStatus =
  | "idle"
  | "sending" // <-- New
  | "thinking"
  | "responding"
  | "error";
```

**State Transition Logic:**

- **`idle`**: The initial state. Ready for input.
- **`sending`**: Immediately after `sendMessage` is called for optimistic UI feedback.
- **`thinking`**: After the backend acknowledges the request.
- **`responding`**: When the first `text.delta` event is received.
- **`idle`**: When the run is complete.

### 3.6. Package Structure and Developer Experience

The final package should be easy to use and have minimal footprint, with `useChat` as the primary export and `@inngest/realtime` as a `peerDependency`.

---

## Phase 2: Cancellation Features

This phase will focus on implementing the `stop()` functionality, which requires coordinated changes across the frontend and backend.

### 4.1. Updating the Transport Layer for Cancellation

The `AgentTransport` interface and its default implementation will be updated to include a `cancelMessage` method.

**`AgentTransport` Interface Update:**

```typescript
export interface AgentTransport {
  // ... existing methods
  cancelMessage(
    params: { threadId: string },
    options?: RequestOptions
  ): Promise<void>;
}
```

**`DefaultAgentTransportConfig` Update:**

```typescript
export interface DefaultAgentTransportConfig {
  api: {
    // ... existing endpoints
    cancelMessage: string; // e.g., '/api/chat/cancel'
  };
  // ...
}
```

### 4.2. Durable Stop (`stop`) via Inngest Cancellation

Simply aborting a client-side `fetch` is insufficient. The correct approach is to use Inngest's event-based cancellation.

**Implementation Plan:**

1.  **Backend: Configure Cancellation:** The `run-agent-chat` Inngest function will be configured with `cancelOn` to listen for a specific cancellation event, correlated by `threadId`.

    ```typescript
    // In inngest/functions/run-agent-chat.ts
    export const runAgentChat = inngest.createFunction(
      {
        id: "run-agent-chat",
        cancelOn: [
          {
            event: "agent/chat.cancelled",
            if: "event.data.threadId == async.data.threadId",
          },
        ],
      },
      { event: "agent/chat.requested" },
      async ({ event, step }) => {
        /* ... */
      }
    );
    ```

2.  **Backend: Create Cancellation API:** A new API endpoint (e.g., `/api/chat/cancel`) will be created. This endpoint receives a `threadId` and sends the `agent/chat.cancelled` event to Inngest.

3.  **Frontend: Expose `stop()` function:** The `useChat` hook will expose a `stop()` function. When invoked, it will call the `transport.cancelMessage(currentThreadId)` method.
