## Contributing to @inngest/use-agents

This document helps new contributors quickly understand the `@inngest/use-agents` package internals and start making changes confidently.

- Tech stack: TypeScript, React 18+, TanStack Query, Vitest
- Architectural style: Hexagonal (ports/adapters) with a React framework layer
- Package scope: React hooks and supporting core for building AgentKit-powered chat UIs

### Quickstart for contributors

- Install deps from the monorepo root: `pnpm install`
- Build the package: `pnpm -w --filter @inngest/use-agents build`
- Type-check: `pnpm -w --filter @inngest/use-agents type-check`
- Lint: `pnpm -w --filter @inngest/use-agents lint`
- Tests: `pnpm -w --filter @inngest/use-agents test`

Note: This package is part of a pnpm workspace; always run workspace-scoped commands via `pnpm -w --filter @inngest/use-agents ...` from the repo root.

---

### src/ tree with one‑line descriptions

```text
src/
  index.ts                                   - Public runtime and type exports for the package
  constants.ts                                - Small compile-time constants (e.g. default thread page size)

  core/                                       - Framework-agnostic domain core (ports, adapters, services)
    index.ts                                  - Core exports (reducer, engine, managers, ports)

    ports/
      connection.ts                           - Realtime connection port (IConnection, token provider, subscription)
      transport.ts                            - HTTP transport port (IClientTransport + request/params types)

    adapters/
      http-transport.ts                       - Default HTTP adapter; endpoint config, URL building, error mapping
      session-transport.ts                    - In-memory session transport; local threads CRUD, delegates runtime to HTTP
      inngest-connection.ts                   - Stub realtime connection adapter (no-op subscribe; future seam)
      __tests__/
        http-transport.test.ts                - Behavioral tests for DefaultHttpTransport
        session-transport.test.ts             - Behavioral tests for InMemorySessionTransport

    services/
      connection-manager.ts                   - Small manager to start/stop IConnection subscriptions
      event-mapper.ts                         - Maps raw realtime chunks → typed NetworkEvent; filtering helpers
      streaming-engine.ts                     - Minimal state container; dispatch + subscription wiring
      streaming-reducer.ts                    - Pure reducer handling streaming events and thread actions
      thread-manager.ts                       - Thread list utilities: merge, dedupe, cache parsing, date revival
      __tests__/
        connection-manager.test.ts            - ConnectionManager lifecycle tests
        event-mapper.test.ts                  - Event mapping and filter tests
        streaming-engine.test.ts              - Engine state/subscribe lifecycle tests
        streaming-reducer.test.ts             - Reducer behavior: events, tools, status, errors
        thread-manager.test.ts                - Thread utilities and cache parsing tests
        connection.test.ts                    - InngestConnection stub subscribe/unsubscribe tests
        test-utils.ts                         - Test helpers: type guards, fake connection, thread factory

  frameworks/
    react/
      components/
        AgentProvider.tsx                     - Provider for shared transport/connection + QueryClient
        __tests__/AgentProvider.test.tsx      - Provider creation and precedence tests

      hooks/
        use-connection.ts                     - React hook using @inngest/realtime for tokenized subscriptions
        __tests__/use-connection.test.tsx     - Token gating + message/state delivery tests

        use-agents/
          index.ts                            - Unified chat hook (threads + realtime + actions)
          types.ts                            - Public hook config/return types
          provider-context.ts                 - Safe access to provider state + identity/transport resolvers
          logging-events.ts                   - Internal debug event name constants
          __tests__/
            provider-context.test.tsx         - Provider context resolution tests
            useAgents.core.test.tsx           - Core send/cancel/state rehydrate flow tests

        use-ephemeral-threads.ts              - (Deprecated) client-side threads via storage; use session transport instead

  types/
    index.ts                                  - Centralized types: UI parts, events, streaming state, errors, logger

  utils/
    message-formatting.ts                     - UI → AgentKit history conversion (text, tool call/result folding)

  __tests__/
    utils/broadcast-channel.ts                - BroadcastChannel polyfill for JSDOM tests
    utils/inngest-hook-mock.ts                - Vitest mock for @inngest/realtime useInngestSubscription
```

---

### Architecture overview

- Ports (interfaces) in `core/ports/` define stable boundaries for transports and realtime connections.
- Adapters in `core/adapters/` implement those ports: HTTP requests and in-memory session behavior.
- Services in `core/services/` provide pure logic (reducer), state orchestration (engine), event mapping, and connection lifecycle.
- The React layer (`frameworks/react/`) composes these into hooks and a provider while staying thin and easily swappable.

Key flows:

- Realtime: `use-connection` uses `@inngest/realtime`’s hook with an explicit token refetcher. Messages are mapped with `event-mapper` and applied to the `streaming-reducer` via the `streaming-engine`.
- Threads: TanStack Query powers server pagination when a `QueryClientProvider` is present; otherwise a local fallback path is used. Thread flags (e.g., hasNewMessages) are overlaid from engine state.
- Cross-tab sync: `use-agents` broadcasts events and state snapshots via `BroadcastChannel` for multi-tab consistency and resumable streams (needs further testing and refinement).

### Notable design decisions

- Framework-agnostic core: reducer, engine, ports, and adapters have no React dependencies; React is an integration layer.
- Single source of truth for types in `src/types/index.ts` to avoid drift: message parts, event shapes, state, and errors.
- Token-required realtime: subscriptions are enabled only when a `refreshToken` is supplied; otherwise disabled by design.
- Defensive reducer: unknown actions are no-ops; ensures incremental evolution without regressions.
- Error model: HTTP errors are classified into recoverable/non-recoverable via `createAgentError` and surfaced consistently.

### Adapters and ports

HTTP transport (`DefaultHttpTransport`):

- Configurable endpoints; relative URLs are optionally prefixed by `baseURL`.
- Path param replacement + URI encoding for endpoints like `/api/threads/{threadId}`.
- Default headers/body functions can be async and are merged with per-request options.
- GET/DELETE never send a body; 204 responses resolve to `undefined`.
- Errors parse JSON `{error.message}` or `{message}` when available; otherwise fall back to HTTP status text. A rich `agentError` is attached.

Session transport (`InMemorySessionTransport`):

- Delegates runtime actions (send, token, approvals) to HTTP while keeping a per-tab in-memory thread list.
- Useful for demos or ephemeral experiences without persistence.

Realtime connection (`InngestConnection` + `ConnectionManager`):

- `InngestConnection` is a stub today (no real socket), establishing the seam for a non-React client in the future.
- `ConnectionManager` owns subscription lifecycle; `use-connection` currently uses the official React hook instead.

### Reducer, engine, and events

- `reduceStreamingState` handles:
  - Connection state → `isConnected`
  - Run lifecycle: `run.started` → thinking; `run.completed|stream.ended` → idle (+ finalize tools)
  - Message assembly: `part.created`, `text.delta`, `part.completed`
  - Tool calls: merges JSON argument deltas, accumulates tool output, finalizes on completion
  - Thread actions: set current thread, replace/clear messages, mark viewed, create/remove
- `StreamingEngine` holds state, notifies subscribers only on reference changes, and can wire a connection subscription.
- `event-mapper` converts raw chunks (with common envelopes) into typed `NetworkEvent` and supplies a simple thread/user filter.

### Threads and history

- `ThreadManager` merges server threads into local order, dedupes by `id`, revives dates, and parses cached entries defensively.
- History loading is domain-aware: if a thread claims messages but none are in state, a one-time revalidation fetch is triggered.
- `message-formatting` converts UI messages (including completed tool calls/results) into the AgentKit history format for the backend.

### React integration

- `AgentProvider` centralizes transport/connection and provides a `QueryClient` if not supplied. It also resolves a channel key in priority order: `channelKey` > `userId` > generated anonymous ID.
- `use-agents` is the unified hook exposing:
  - State: messages, status, connectivity, threads (+ flags), and errors
  - Actions: send/cancel, approve/deny tool calls, thread navigation, and history utilities
  - Works with or without a `QueryClientProvider`; falls back to local thread pagination if absent

### Roadmap notes

- Replace the React `use-connection` path with a framework-agnostic `InngestConnection` managed via `ConnectionManager` and bridge into React via `useSyncExternalStore`.
- Continue migrating logic into hexagonal core to keep React layer thin and easily swappable.
