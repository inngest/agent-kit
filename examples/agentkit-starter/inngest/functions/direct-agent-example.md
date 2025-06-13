# Direct Agent Example

This example shows how to use an agent directly with `agent.run()` without creating a network.

## Triggering the Function

You can trigger this function by sending an event to Inngest:

```typescript
import { inngest } from "./inngest/client";

// Send a simple query
await inngest.send({
  name: "direct-agent/run",
  data: {
    query: "What is the capital of France?",
  },
});

// Send another query
await inngest.send({
  name: "direct-agent/run",
  data: {
    query: "Explain quantum computing in simple terms",
  },
});
```

## Key Differences from Network-based Agents

1. **No Router**: The agent runs directly without any routing logic
2. **Single Agent**: Only one agent processes the request
3. **No State Management**: Each request is independent with no conversation history
4. **Direct Response**: Returns immediately after the agent responds
5. **No Multi-Agent Coordination**: Can't hand off to other agents

## When to Use This Pattern

Use direct agents when:

- You need stateless, one-off responses
- Each request is independent (no conversation context needed)
- You don't need multi-agent coordination
- You want minimal overhead
- You're building simple utilities or one-shot assistants

## Response Format

The function returns:

```typescript
{
  message: TextMessage,      // The assistant's response
  agentResult: AgentResult,  // Exported agent result (for logging/debugging)
}
```

## Notes

- Each invocation is completely independent
- No conversation history is maintained between calls
- Perfect for simple Q&A, translations, or text transformations
- If you need conversation history, consider using the network-based approach
