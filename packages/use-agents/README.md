# @inngest/use-agents

React hooks for building AI chat interfaces with AgentKit.

This package provides a comprehensive set of React hooks for integrating with AgentKit networks and building real-time AI chat applications with streaming, persistence, and multi-thread support.

## Installation

```bash
npm install @inngest/use-agents
# or
pnpm add @inngest/use-agents
# or
yarn add @inngest/use-agents
```

## Peer Dependencies

This package requires the following peer dependencies:

```bash
npm install react @inngest/realtime uuid
```

## Quick Start

### Basic Usage

```typescript
import { useChat, AgentProvider } from '@inngest/use-agents';

function App() {
  return (
    <AgentProvider userId="user-123">
      <ChatComponent />
    </AgentProvider>
  );
}

function ChatComponent() {
  const {
    messages,
    sendMessage,
    status,
    isConnected
  } = useChat();

  return (
    <div>
      <div>Status: {status}</div>
      <div>Connected: {isConnected ? 'Yes' : 'No'}</div>

      {messages.map(msg => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong>
          {msg.parts.map(part =>
            part.type === 'text' ? part.content : ''
          ).join('')}
        </div>
      ))}

      <button onClick={() => sendMessage('Hello!')}>
        Send Message
      </button>
    </div>
  );
}
```

### Advanced Usage with Custom Transport

```typescript
import {
  AgentProvider,
  useChat,
  createDefaultAgentTransport
} from '@inngest/use-agents';

const customTransport = createDefaultAgentTransport({
  api: {
    sendMessage: '/api/v2/chat',
    fetchThreads: '/api/v2/threads'
  },
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`,
    'X-API-Version': '2.0'
  }
});

function App() {
  return (
    <AgentProvider
      userId="user-123"
      transport={customTransport}
      debug={false}
    >
      <ChatApp />
    </AgentProvider>
  );
}
```

## Core Hooks

### `useAgent`

Core hook for real-time streaming conversations with multi-thread support.

```typescript
const {
  messages,
  status,
  sendMessage,
  isConnected,
  threads,
  setCurrentThread,
} = useAgent({
  threadId: "conversation-123",
  userId: "user-456",
  debug: true,
});
```

### `useChat`

Unified hook combining agent streaming with thread management.

```typescript
const { messages, sendMessage, threads, switchToThread, deleteThread, status } =
  useChat({
    initialThreadId: params.threadId,
    state: () => ({ currentTab: "chat" }),
    onStateRehydrate: (state) => restoreUIState(state),
  });
```

### `useThreads`

Thread persistence, caching, and pagination management.

```typescript
const {
  threads,
  loading,
  hasMore,
  loadMore,
  deleteThread,
  currentThreadId,
  setCurrentThreadId,
} = useThreads({
  userId: "user-123",
  debug: true,
});
```

## Utility Hooks

### `useMessageActions`

Message actions like copy, share, like/dislike with optional toast integration.

```typescript
import { toast } from "sonner"; // or your preferred toast library

const { copyMessage, shareMessage, likeMessage } = useMessageActions({
  showToast: (message, type) => toast[type](message),
  onCopy: (text) => console.log("Copied:", text),
  onShare: (text) => analytics.track("message_shared", { length: text.length }),
});
```

### `useEphemeralThreads`

Client-side thread storage for demos and prototypes.

```typescript
const ephemeralThreads = useEphemeralThreads({
  userId: "demo-user",
  storageType: "session", // or 'local'
});

const chat = useChat({
  userId: "demo-user",
  enableThreadValidation: false,
  ...ephemeralThreads,
});
```

### `useConversationBranching`

Message editing and alternate conversation paths.

```typescript
const branching = useConversationBranching({
  userId: "user-123",
  storageType: "session",
});

// Enable message editing that creates conversation branches
const sendMessage = useCallback(
  async (message, options) => {
    await branching.sendMessage(
      originalSendMessage,
      sendMessageToThread,
      replaceThreadMessages,
      threadId,
      message,
      messages,
      options
    );
  },
  [branching /* ... */]
);
```

## Provider Integration

The `AgentProvider` enables shared connections and configuration:

```typescript
import { AgentProvider, useChat } from '@inngest/use-agents';

// Wrap your app with AgentProvider
function App() {
  return (
    <AgentProvider
      userId="user-123"
      channelKey="collaboration-room-456" // Optional: for collaborative features
      debug={process.env.NODE_ENV === 'development'}
      transport={{
        headers: () => ({ 'Authorization': `Bearer ${getToken()}` })
      }}
    >
      <ChatApp />
    </AgentProvider>
  );
}

// Hooks automatically inherit provider configuration
function ChatApp() {
  const chat = useChat(); // Inherits userId, transport, etc. from provider
  return <ChatInterface {...chat} />;
}
```

## TypeScript Support

The package includes comprehensive TypeScript definitions:

```typescript
import type {
  ConversationMessage,
  Thread,
  AgentStatus,
  AgentTransport,
  UseAgentReturn,
  UseChatReturn,
} from "@inngest/use-agents";

// All hooks and components are fully typed
const chat: UseChatReturn = useChat({
  initialThreadId: "thread-123",
  state: () => ({ currentPage: "/chat" }),
  onStateRehydrate: (clientState: Record<string, unknown>) => {
    // Fully typed client state
  },
});
```

## License

Apache-2.0

## Contributing

See the main [AgentKit repository](https://github.com/inngest/agent-kit) for contribution guidelines.
