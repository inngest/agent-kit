# AgentKit + assistant-ui

This example renders an AgentKit agent with [assistant-ui](https://www.assistant-ui.com). The `useAgent` hook from `@inngest/use-agent` owns the conversation state, and assistant-ui's [external store runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) draws it with its thread, composer and tool UI components.

The agent is a store support bot with one tool, `get_order`, which looks up an order in a small mock data set. The UI renders the result as an order card. Each chat is a thread you can switch back to from the sidebar.

Text arrives over Inngest Realtime, but this is not native token streaming. AgentKit publishes each model response once it is complete, and `simulateChunking` splits it into small deltas, so a reply starts only after the model finishes and then appears in pieces.

The example is tested with `claude-haiku-4-5`. The published `@inngest/agent-kit` 0.13.2 fails on the `thinking` blocks that newer Claude models return; [#287](https://github.com/inngest/agent-kit/pull/287) adds thinking-block support on `main`.

Approvals (human-in-the-loop tool calls) are left out for now. `useAgent` doesn't yet have a supported way for a custom UI to know that a run is waiting for approval.

## How it fits together

| File                                         | What it does                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `app/api/inngest/functions/support-agent.ts` | The agent, its tool and the Inngest function that runs it with streaming |
| `app/api/chat/route.ts`                      | Sends `agent/chat.requested` to start a run                              |
| `app/api/realtime/token/route.ts`            | Issues the Inngest Realtime subscription token                           |
| `components/assistant-ui/useAgentRuntime.ts` | Connects `useAgent` to `useExternalStoreRuntime`                         |
| `components/assistant-ui/convertMessage.ts`  | Converts AgentKit messages to assistant-ui messages                      |
| `components/assistant-ui/Thread.tsx`         | The thread list, thread and order card                                   |

The thread list lives in the browser (`createInMemorySessionTransport`), so threads disappear on reload. To keep them, add a [history adapter](https://agentkit.inngest.com/concepts/history) and `/api/threads` routes on the server, then switch the client to a server-backed transport, turn thread validation back on, and fill the sidebar from the saved threads instead of local state. The [`use-agent` example](../use-agent) shows one, but treat it as reference code: it builds against the monorepo workspace and does not run standalone.

## Prerequisites

- Node.js 22.15+ on Node 22, Node 24, or Node 26+
- An Anthropic API key

## Getting started

1. Install dependencies:

   ```bash
   cd examples/assistant-ui
   npm install
   ```

2. Create a `.env.local` file:

   ```bash
   cp .env.example .env.local
   ```

   Set `ANTHROPIC_API_KEY`. `INNGEST_DEV=1` points the Inngest SDK at the local Dev Server.

3. Start the app on [http://localhost:3102](http://localhost:3102):

   ```bash
   npm run dev
   ```

4. In another terminal, start the Inngest Dev Server:

   ```bash
   npx inngest-cli@latest dev -u http://localhost:3102/api/inngest
   ```

   The Dev Server UI at [http://127.0.0.1:8288](http://127.0.0.1:8288) shows each run and its steps. If a model call fails (for example, with a bad API key), Inngest retries the step, so the error can take a few minutes to appear in the chat; the Dev Server shows the retries meanwhile.

Try "Where is order 1002?", then ask a follow-up such as "When was it placed?" in the same chat. Orders 1001 and 1002 exist.
