# AgentKit Multi-Agent Subscription and State Management Specification

## Status

**Proposed** - Under active discussion and implementation

## Overview

This specification addresses critical architectural challenges in AgentKit's current client-side integration pattern and proposes a comprehensive solution for multi-agent, multiplexed subscription management with flexible state injection capabilities.

## Problem Statement

### Current Issues

1. **Subscription Conflicts**: Multiple `useAgent` instances with the same `userId` create conflicting Inngest subscriptions, leading to "Cannot cancel a locked stream" errors
2. **Limited Multi-Agent Patterns**: Current architecture assumes one agent per user session, but real applications need:
   - Parallel conversations within the same thread (subchats)
   - Multiple agents working simultaneously on different aspects of a problem
   - A/B testing scenarios with parallel agent responses
   - Spreadsheet-like interfaces with agents per cell
3. **Inflexible Subscription Model**: Hard-coded `userId` as subscription key doesn't support:
   - Admin dashboards viewing multiple user sessions
   - Multi-tenant applications
   - Custom subscription scoping
4. **State Management Gaps**: No clear pattern for:
   - Client-side state injection (system prompts, configuration)
   - Differentiating client vs server state
   - Message-level state persistence for conversation time-travel

### Example Failure Scenarios

```typescript
// PROBLEM: These create conflicting subscriptions
const agent1 = useAgent({ threadId: "thread-1", userId: "user-123" }); // Tab 1
const agent2 = useAgent({ threadId: "thread-2", userId: "user-123" }); // Tab 2
// Result: "Cannot cancel a locked stream" error

// PROBLEM: No way to pass client state
const agent = useAgent({ threadId: "thread-1", userId: "user-123" });
await agent.sendMessage("Generate code", {
  // ❌ No way to pass: language, framework, style preferences
});
```

## Proposed Solution

### Core Principles

1. **Single Global Streaming Connection**: One Inngest subscription per logical scope (configurable key)
2. **Multiplexed Event Routing**: Events tagged with context identifiers for client-side demultiplexing
3. **Flexible Agent Spawning**: Support both network-defined agents and client-spawned instances
4. **Structured State Management**: Clear separation between client and server state with namespacing
5. **Unified API Surface**: Simple `chat.sendMessage()` interface that handles complexity internally

## Technical Architecture

### 1. Configurable Subscription Keys

**Current (Rigid)**:

```typescript
const agent = useAgent({
  threadId: "thread-123",
  userId: "user-456", // Hard-coded as subscription key
});
```

**Proposed (Flexible)**:

```typescript
const agent = useAgent({
  threadId: "thread-123",
  key: "admin-session-789", // Custom subscription key
});
```

**Use Cases**:

- **Admin Dashboards**: `key: 'admin-dashboard-${adminId}'`
- **Multi-tenant Apps**: `key: 'tenant-${orgId}-${userId}'`
- **Spreadsheet Cells**: `key: 'spreadsheet-${sheetId}-cell-${row}-${col}'`
- **A/B Testing**: `key: 'experiment-${userId}-${variantId}'`

### 2. Global Provider Pattern

**Implementation**:

```typescript
// Application Root
function App() {
  return (
    <AgentProvider> {/* Auto-generates subscription key */}
      <ChatInterface />
      <AdminPanel />
      <MultiChatPage />
    </AgentProvider>
  );
}

// Components use agents without subscription conflicts
function ChatInterface() {
  const { sendMessage } = useChat(); // Uses global subscription
}
```

**Benefits**:

- ✅ Eliminates subscription conflicts
- ✅ Centralized connection management
- ✅ Predictable resource usage (one WebSocket)
- ✅ Auto-generated keys remove cognitive overhead

### 3. Multi-Agent Coordination Patterns

#### Pattern A: Network-Defined Agents

```typescript
// Server-side network defines multiple agents
const network = createNetwork({
  agents: [financialAgent, securityAgent, complianceAgent],
});

// Client spawns multiple contexts from same network
await chat.sendMessage("Analyze AAPL stock", {
  key: "financial-analysis",
  state: { focus: "revenue" },
});
await chat.sendMessage("Security analysis of AAPL", {
  key: "security-analysis",
  state: { focus: "vulnerabilities" },
});
```

#### Pattern B: Client-Spawned Instances

```typescript
// Client spawns multiple instances of same agent with different state
await chat.sendMessage("Analyze AAPL", {
  key: "analysis-conservative",
  state: { model: "gpt-4", temperature: 0.1, risk_tolerance: "low" },
});
await chat.sendMessage("Analyze AAPL", {
  key: "analysis-aggressive",
  state: { model: "claude-3", temperature: 0.8, risk_tolerance: "high" },
});
```

### 4. Client State Injection

**Proposed State Structure**:

```typescript
interface NetworkState {
  // Server-managed state (persistent)
  analysis?: AnalysisResult;
  workflow?: WorkflowState;

  // Client-injected state (ephemeral, read-write during run)
  client?: {
    userPreferences: UserPrefs;
    sessionConfig: Config;
    contextData: any;
  };
}
```

**Usage Pattern**:

```typescript
// Client passes state that becomes available at network.state.data.client
await chat.sendMessage("Generate code", {
  key: "coding-task",
  state: {
    language: "typescript",
    framework: "react",
    guidelines: "use functional components",
    theme: "dark",
  },
});

// Server-side access
function codingTool(args, { network }) {
  const clientPrefs = network.state.data.client; // Client-provided state
  const serverData = network.state.data.analysis; // Server-generated state

  // Use both for informed code generation
  return generateCode(args, clientPrefs, serverData);
}
```

### 5. Event Multiplexing and Routing

**Event Payload Structure**:

```typescript
interface EnrichedAgentEvent {
  // Standard AgentKit event data
  event: "text.delta" | "part.created" | "run.started" | etc.;
  data: { content: string; partId: string; etc. };

  // Multiplexing metadata
  subscriptionKey: string;   // Which provider instance
  threadId?: string;         // Which conversation
  key?: string;             // Which parallel invocation
  runId: string;            // Which agent run
  messageId: string;        // Which message

  // Standard streaming metadata
  timestamp: number;
  sequenceNumber: number;
  id: string;
}
```

**Client-Side Demultiplexing**:

```typescript
function useChat(options) {
  const subscription = useInngestSubscription({
    key: globalSubscriptionKey, // Single subscription
    onMessage: (event) => {
      // Route event to appropriate chat instance
      if (event.key === options.key && event.threadId === options.threadId) {
        handleEvent(event);
      }
    },
  });
}
```

### 6. Unified Chat API

**Primary Interface**:

```typescript
interface ChatAPI {
  sendMessage(
    text: string,
    options?: {
      key?: string; // Auto-generated if not provided
      state?: any; // Client state injection
      threadId?: string; // Thread context
      streaming?: boolean; // Enable/disable streaming
    }
  ): Promise<ChatResponse>;
}
```

**Usage Examples**:

```typescript
const chat = useChat();

// Simple usage (auto-generated key)
await chat.sendMessage("Hello world");

// Parallel analysis with different configurations
await Promise.all([
  chat.sendMessage("Analyze this data", {
    key: "financial",
    state: { focus: "revenue", model: "gpt-4" },
  }),
  chat.sendMessage("Analyze this data", {
    key: "technical",
    state: { focus: "performance", model: "claude-3" },
  }),
  chat.sendMessage("Analyze this data", {
    key: "security",
    state: { focus: "vulnerabilities", model: "gpt-4" },
  }),
]);

// Spreadsheet cell usage
await chat.sendMessage("=SUM(A1:A10)", {
  key: `cell-${row}-${col}`,
  state: {
    cellPosition: `${row},${col}`,
    format: "number",
    dependencies: getCellDependencies(row, col),
  },
});
```

## Hook Architecture

### Hook Hierarchy and Responsibilities

```typescript
// useAgent: Foundation - Real-time streaming with AgentKit
const agent = useAgent({
  key: 'unique-subscription-key',    // New: replaces userId
  threadId: 'thread-123',
  disabled?: boolean                 // New: for hybrid patterns
});

// useThreads: Persistence - REST API for thread CRUD
const threads = useThreads({
  userId: 'user-456'
});

// useChat: Coordination - Orchestrates useAgent + useThreads
const chat = useChat({
  userId: 'user-456',
  initialThreadId?: 'thread-123',
  config?: {
    defaultKey?: string,
    debug?: boolean
  }
});
```

### Hybrid Agent Pattern

**Problem**: Supporting both global and local agent patterns.

**Solution**: Conditional agent creation with disabled flag.

```typescript
// In useChat implementation
function useChat(options) {
  const agentContext = useContext(AgentContext);

  // Always create local agent (React rules), but conditionally disable
  const localAgent = useAgent({
    threadId: currentThreadId,
    key: options.key || generateKey(),
    disabled: !!agentContext, // Disable if global context exists
  });

  // Use global agent if available, otherwise use local agent
  const agent = agentContext?.agent || localAgent;

  return { sendMessage: agent.sendMessage /* ... */ };
}
```

## Implementation Phases

### Phase 1: Foundation ✅ **COMPLETED**

- [x] Fixed dual subscription issue in useChat
- [x] Added comprehensive telemetry logging
- [x] Created MultiChat test page demonstrating multiple agents
- [x] Implemented hybrid useChat approach
- [x] Added `disabled` parameter to useAgent

### Phase 2: Core Multiplexing 🔄 **IN PROGRESS**

- [ ] Replace `userId` with configurable `key` parameter in useAgent
- [ ] Auto-generate subscription keys in AgentProvider
- [ ] Add event correlation metadata (subscriptionKey, key, threadId)
- [ ] Build client-side event demultiplexer
- [ ] Update all streaming events to include routing metadata

### Phase 3: State Management 📋 **PLANNED**

- [ ] Implement client state injection (network.state.data.client)
- [ ] Add state namespacing and type safety
- [ ] Build message-level state persistence
- [ ] Create state time-travel APIs

### Phase 4: Advanced Patterns 🔮 **FUTURE**

- [ ] Multi-agent coordination utilities
- [ ] Parallel execution optimizations
- [ ] Advanced error handling and recovery
- [ ] Performance monitoring and optimization

## Test Scenarios

### Current Test Pages

1. **Simple Chat** (`/chat`): Standard ChatGPT-like interface
2. **Multi-Chat** (`/multi-chat`): Multiple parallel conversations
3. **Use Agent Standalone** (`/test/use-agent`): Direct useAgent usage
4. **Manual Coordination** (`/test/manual-coordination`): useAgent + useThreads
5. **UseChat with Provider** (`/test/use-chat-with-provider`): Global agent pattern
6. **UseChat without Provider** (`/test/use-chat-without-provider`): Local agent pattern

### Planned Test Pages

7. **Spreadsheet App**: Agents per cell with different configurations
8. **A/B Testing Page**: Same prompt, multiple agents, compare outputs
9. **Admin Dashboard**: Multiple user sessions viewed simultaneously
10. **Real-time Collaboration**: Multiple users, shared state

### Edge Case Testing

- **Rapid key switching**: User changes keys faster than responses arrive
- **Key collision**: Two components accidentally use same key
- **Provider mounting/unmounting**: Dynamic AgentProvider lifecycle
- **Large state objects**: Performance with substantial client state
- **Network interruption**: Connection drops during multi-agent run
- **Key overflow**: Many unique keys in short time span

## Open Questions

### 1. Subscription Key Granularity

**Question**: Should subscription keys be hierarchical (e.g., `org:team:user`) or flat strings?

**Considerations**:

- Hierarchical: Better for multi-tenant apps, more complex parsing
- Flat: Simpler implementation, requires careful naming conventions
- Impact on event filtering performance

**Recommendation**: Start with flat strings, add hierarchical support if needed.

### 2. State Type Safety

**Question**: How do we maintain type safety for client-injected state across the TypeScript client/server boundary?

**Options**:

- Code generation from shared schemas
- Runtime validation with Zod
- Accept type erasure at boundary
- Require explicit type annotations

**Recommendation**: Runtime validation with Zod for robustness.

### 3. Event Ordering Guarantees

**Question**: Do we need to guarantee message ordering within a conversation when multiple agents run in parallel?

**Current**: AgentKit has sequence number mechanism for ordering.
**Recommendation**: Leverage existing sequence numbers, ensure proper ordering per conversation.

### 4. Error Recovery Patterns

**Question**: How should we handle partial failures in parallel agent execution?

**Scenarios**:

- One of three parallel agents fails
- Network connection drops during multi-agent run
- Rate limiting affects subset of agents
- State corruption in shared context

**Recommendation**: Graceful degradation with error boundaries per agent.

### 5. Resource Management

**Question**: How do we prevent resource exhaustion from unlimited parallel agent spawning?

**Options**:

- Global concurrency limits
- Per-user/session quotas
- Automatic queuing and batching
- Resource-aware scheduling

**Recommendation**: Lets not worry about this for now.

## Security Considerations

### Client State Injection

- **Input validation**: All client state must be validated server-side
- **Sandboxing**: Client state should not affect system operations
- **Audit logging**: Track client state usage for debugging
- **Rate limiting**: Prevent abuse of state injection

### Subscription Key Management

- **Access control**: Keys should encode permissions/scope
- **Key rotation**: Support for updating subscription keys
- **Namespace isolation**: Prevent cross-tenant data leakage

## Performance Implications

### Multiplexing Overhead

- **Event filtering**: Client-side filtering adds CPU overhead
- **Memory usage**: Event buffers per active conversation
- **Network efficiency**: Larger payloads due to routing metadata

**Mitigations**:

- Efficient filtering algorithms
- Garbage collection for inactive conversations
- Payload compression

### Subscription Management

- **Connection reuse**: Single WebSocket reduces overhead
- **Heartbeat mechanisms**: Detect and recover from connection issues
- **Backpressure handling**: Manage high-frequency events

## Success Metrics

### Technical Metrics

- Zero "Cannot cancel a locked stream" errors
- Single WebSocket connection per logical scope
- Sub-100ms event routing latency
- Memory usage scales linearly with active conversations
- 99.9% message delivery success rate

### Developer Experience

- Simple API for common use cases (1-3 lines of code)
- Clear error messages and debugging tools
- Comprehensive TypeScript support
- Extensive documentation and examples
- Migration completed in < 1 day for existing apps

### Application Capabilities

- Support for unlimited parallel conversations
- Real-time multi-agent coordination
- Stateful conversation branching
- Enterprise-grade multi-tenancy
- Sub-second response times for parallel agents

## Risks and Mitigations

| Risk                                        | Impact | Probability | Mitigation                                                  |
| ------------------------------------------- | ------ | ----------- | ----------------------------------------------------------- |
| Breaking changes disrupt existing apps      | High   | Medium      | Comprehensive migration guide, backward compatibility layer |
| Performance degradation from multiplexing   | Medium | Low         | Thorough performance testing, optimization benchmarks       |
| Increased complexity confuses developers    | Medium | Medium      | Excellent documentation, progressive disclosure in API      |
| State management introduces subtle bugs     | High   | Medium      | Extensive testing, clear state mutation patterns            |
| Security issues from client state injection | High   | Low         | Input validation, sandboxing, security review               |
| Memory leaks from abandoned conversations   | Medium | Medium      | Automatic cleanup, conversation lifecycle management        |

## Conclusion

This architectural evolution addresses fundamental scalability and flexibility limitations in AgentKit's current client integration. The proposed changes enable sophisticated multi-agent patterns while maintaining a simple API surface for common use cases.

The key insight is that **multiplexing complexity should be hidden from developers** - they should be able to spawn parallel agents as easily as making multiple API calls, while the framework handles the underlying subscription management and event routing.

Success will be measured by both the elimination of current pain points (subscription conflicts) and the enablement of new patterns (parallel agents, client state injection, conversation time-travel) that weren't possible before.
