# Routing Approaches in AgentKit

## Code-based Router vs Routing Agent

### Code-based Router (Deterministic)

**What the docs show**

```typescript
router: ({ network, lastResult, callCount }) => {
  // Direct logic to return an agent
  if (callCount === 0) {
    return triageAgent;
  }
  // ... more logic
  return undefined; // Exit
};
```

**Pros:**

- Fast - no LLM calls
- Predictable and deterministic
- Easy to debug
- Lower cost (no API calls)

**Cons:**

- Less flexible
- Requires explicit logic for every scenario
- Can become complex with many conditions

**Best for:**

- Simple routing logic
- Cost-sensitive applications
- When you need predictable behavior
- High-performance requirements

### Routing Agent (AI-powered)

**What you implemented**

```typescript
const routingAgent = createRoutingAgent({
  name: "Router",
  tools: [
    // Tools for routing decisions
  ],
  lifecycle: {
    onRoute: ({ result }) => {
      // Extract agent names from tool calls
    },
  },
});
```

**Pros:**

- Highly flexible
- Can understand context and nuance
- Adapts to new scenarios without code changes
- Can provide reasoning for decisions

**Cons:**

- Requires LLM calls (slower, costs money)
- Less predictable
- Harder to debug
- Can make mistakes

**Best for:**

- Complex routing logic
- When context matters
- Dynamic scenarios
- When you want explainable routing decisions

## Key Implementation Details

### For Code-based Routers:

- Return an `Agent` instance to route to that agent
- Return `undefined` to exit the network
- Access state via `network.state.data`
- Check `lastResult` for previous agent's output

### For Routing Agents:

- Must ensure agent names in tools match actual agent names exactly
- The routing agent needs to call its tools (not just return)
- Use `onRoute` lifecycle to extract routing decisions from tool calls
- System prompt should list available agents clearly

## Common Pitfalls

1. **Name Mismatches**: Ensure agent names in routing logic match actual agent names
2. **Missing Tool Calls**: Routing agents must actually call their tools
3. **Infinite Loops**: Always have exit conditions
4. **State Management**: Update state to track routing decisions

## Hybrid Approach

You can also combine both approaches:

```typescript
router: ({ callCount, lastResult }) => {
  // Use deterministic logic for simple cases
  if (callCount === 0) {
    return triageAgent;
  }

  // Use AI routing for complex decisions
  if (needsComplexRouting(lastResult)) {
    return myRoutingAgent;
  }

  return undefined;
};
```

