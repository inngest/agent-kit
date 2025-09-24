---
"@inngest/use-agent": minor
---

# New Package: @inngest/use-agent

Introducing a comprehensive React hooks package for building AI chat interfaces with AgentKit networks.

## What's New

**@inngest/use-agent** is a standalone npm package that provides a complete set of React hooks for integrating with AgentKit. This package extracts and consolidates all the React functionality needed to build sophisticated AI chat applications.

### Core Features

- **Core Hooks**: `useAgent`, `useChat`, `useThreads` for real-time streaming and thread management
- **Utility Hooks**: `useEphemeralThreads`, `useConversationBranching`, `useEditMessage`, `useMessageActions`, `useSidebar`, `useIsMobile`
- **Provider System**: `AgentProvider` for shared connections and configuration
- **Transport Layer**: Configurable API layer with `DefaultAgentTransport` and custom transport support
- **TypeScript Support**: Full type definitions for all hooks and components
- **Next.js Compatibility**: All hooks properly marked with "use client" directives

### Installation

```bash
npm install @inngest/use-agents
# Peer dependencies
npm install react @inngest/realtime uuid
```

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
  const { messages, sendMessage, status } = useChat();
  return <div>/* Your chat UI */</div>;
}
```

### Why This Package

This package enables developers to:

- Build AI chat applications without reinventing the wheel
- Leverage pre-built, battle-tested React hooks for AgentKit integration
- Maintain consistent patterns across different projects
- Focus on UI/UX instead of low-level streaming and state management

### Migration Guide

If you were previously using local hooks from AgentKit examples, replace local imports:

```typescript
// Before
import { useChat } from "@/hooks";
import { AgentProvider } from "@/contexts/AgentContext";

// After
import { useChat, AgentProvider } from "@inngest/use-agents";
```

No functional changes are required - the API is identical to the previous local implementation.
