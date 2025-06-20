# AgentKit Starter: Conversational Chat with History

This Next.js starter application demonstrates how to build a full-featured chat application with persistent conversation history using AgentKit. It showcases thread management, conversation switching, and history rehydration backed by a PostgreSQL database.

## Features

- **ChatGPT-Style Interface**: A familiar and intuitive chat UI.
- **Persistent Conversations**: Conversation context is maintained across multiple sessions.
- **Thread Management**: Create, switch between, and delete conversations from a sidebar.
- **History Rehydration**: Full message history is restored from the database on page load.
- **Real-time Streaming**: Responses are streamed from AgentKit to the UI in real-time.
- **Optimized Persistence**: Supports both client-authoritative and server-authoritative history patterns to balance performance and reliability.
- **Durable Workflows**: Powered by Inngest for reliable, resumable agent execution.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A PostgreSQL database

### 1. Installation & Setup

```bash
# Clone this repository and navigate into the starter example
git clone https://github.com/inngest/agent-kit.git
cd agent-kit/examples/agentkit-starter

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

Now, open the `.env` file and add your `OPENAI_API_KEY` and your PostgreSQL database connection string (`DATABASE_URL`).

### 2. Initialize the Database

Run the setup script to create the necessary tables in your database:

```bash
npm run setup-db
```

### 3. Start the Development Environment

You'll need two terminal windows running concurrently:

```bash
# Terminal 1: Start Inngest dev server
npx inngest-cli@latest dev
```

```bash
# Terminal 2: Start Next.js app
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Architecture: Conversation Persistence with History Adapters

This starter uses AgentKit's history system to manage conversation state. We are using a **History Adapter** as a configuration object that bridges AgentKit's lifecycle with your database.

#### History Adapter Interface

You define how to create, load, and save conversations by implementing these methods:

```typescript
interface HistoryConfig<T extends StateData> {
  createThread?: (ctx: CreateThreadContext<T>) => Promise<{ threadId: string }>;
  get?: (ctx: Context<T>) => Promise<AgentResult[]>;
  appendResults?: (
    ctx: Context<T> & {
      newResults: AgentResult[];
      userMessage?: { content: string; role: "user"; timestamp: Date };
    }
  ) => Promise<void>;
}
```

1.  **`createThread`**: Creates a new conversation thread record in your database.
2.  **`get`**: Retrieves a conversation's full message history from your database.
3.  **`appendResults`**: Saves new user and agent messages from the current turn to your database.

#### Persistence Patterns

There are two patterns for managing history in your application:

**1. Server-Authoritative (Reliable Fallback)**

- **How it works:** The client sends a message with a `threadId`. AgentKit uses the `history.get()` hook to load the full context from the database before the agent runs.
- **Use case:** Ideal for restoring a conversation after a page refresh or when opening the app on a new device.

**2. Client-Authoritative (Optimized Performance)**

- **How it works:** The client (the Next.js app) maintains the conversation state locally. It sends the new message _and_ the entire conversation history to the agent.
- **Benefit:** AgentKit detects the provided history and **skips** the `history.get()` database call, reducing latency for a faster user experience. The `history.appendResults()` hook is still called at the end to ensure new messages are saved.

## Application Structure

Key files in this example:

- **`inngest/db.ts`**: The PostgreSQL history adapter implementation.
- **`inngest/functions/simple-agent.ts`**: The main agent function, configured with the history adapter.
- **`app/api/chat/route.ts`**: The API endpoint that receives messages from the UI and invokes the agent.
- `app/api/threads/**`: API routes for managing conversation threads (creating, listing, deleting).
- **`components/chat/Chat.tsx`**: The main React component for the chat interface.
- **`components/chat/ChatSidebar.tsx`**: The component for listing and managing threads.
- **`scripts/setup-db.ts`**: The database initialization script.

### Creating Your Own History Adapter

AgentKit is unopinionated about your persistence layer. You can connect to any database (like MongoDB, a different relational DB, or even a simple file) by creating your own history adapter.

A history adapter is simply a JavaScript object that conforms to the `HistoryConfig` interface. You can implement three optional methods to tell AgentKit how to manage conversations.

Here's an example of how to create a durable history adapter using Inngest:

```typescript
import { type HistoryConfig, type AgentResult } from "@inngest/agent-kit";
// Assume you have a postgres client initialized, e.g., using 'pg' or 'drizzle-orm'
import { db } from "./db";

const postgresHistoryAdapter: HistoryConfig<any> = {
  // 1. Create a new thread durably
  createThread: async ({ step, state }) => {
    // `step.run` makes this database call durable
    const { threadId } = await step.run("create-thread-in-db", async () => {
      // Pseudo-code for creating a thread record.
      // You might associate it with a user ID from the state.
      const newThread = await db
        .insertInto("threads")
        .values({ userId: state.data.userId })
        .returning("id")
        .execute();
      return { threadId: newThread.id };
    });
    return { threadId };
  },

  // 2. Get messages for a thread durably
  get: async ({ step, threadId }) => {
    if (!threadId) return [];

    // Wrap the database query in `step.run` for durability.
    const messages = await step.run("fetch-history-from-db", async () => {
      // Pseudo-code for fetching messages. Your schema might differ.
      // This should return data in the AgentResult[] format.
      const historicalMessages = await db
        .selectFrom("messages")
        .where("threadId", "=", threadId)
        .orderBy("createdAt", "asc")
        .selectAll()
        .execute();
      // You would need to transform this data into AgentResult[]
      return transformToAgentResults(historicalMessages);
    });

    return messages;
  },

  // 3. Append new messages to a thread durably
  appendResults: async ({ step, threadId, newResults, userMessage }) => {
    if (!threadId) return;

    // Use `step.run` for the final database write to ensure it's saved.
    await step.run("append-results-to-db", async () => {
      console.log(
        `Saving ${newResults.length} new results to thread: ${threadId}`
      );

      // Pseudo-code for a transaction
      await db.transaction(async (tx) => {
        if (userMessage) {
          await tx
            .insertInto("messages")
            .values({
              threadId,
              role: "user",
              content: userMessage.content,
              createdAt: userMessage.timestamp,
            })
            .execute();
        }

        // You'd loop through newResults and save each part,
        // transforming it to fit your database schema.
        for (const result of newResults) {
          await tx
            .insertInto("messages")
            .values({
              threadId,
              role: "assistant",
              // ... serialize result data
            })
            .execute();
        }
      });
    });
  },
};
```

#### Passing the Adapter to a Network or Agent

Once you've created your adapter, you pass it to the `history` property when creating an agent or a network. AgentKit then automatically calls your adapter's methods at specific points during the execution lifecycle to manage the conversation state.

Here's when each function is called during an `agent.run()` or `network.run()`:

1.  **At the Start of a Run**:

    - AgentKit first calls an internal `initializeThread` utility.
    - If no `threadId` exists on the state, this utility will invoke your **`createThread()`** hook to generate a new conversation record in your database before any processing happens.

2.  **Immediately After Thread Initialization**:

    - Next, AgentKit calls the `loadThreadFromStorage` utility.
    - This invokes your **`get()`** hook to fetch the conversation's message history and populate the agent's memory.
    - _(Note: This step is automatically skipped if you provide `messages` or `results` directly to `createState`, which enables the client-authoritative optimization pattern)._

3.  **At the End of a Run**:
    - After all agents and tools have completed their work, AgentKit calls the `saveThreadToStorage` utility.
    - This invokes your **`appendResults()`** hook, passing only the _new_ messages that were generated during that specific run. This prevents you from saving duplicate data.

This gives you precise control over your database interactions while letting AgentKit handle the orchestration during a network or agent run.

```typescript
import { createNetwork, createAgent } from "@inngest/agent-kit";
import { postgresHistoryAdapter } from "./my-postgres-adapter"; // Assuming you saved it in a file

const someAgent = createAgent({
  name: "some-agent",
  system: "You are a helpful assistant.",
});

const myNetwork = createNetwork({
  name: "My Chat Network",
  agents: [someAgent],
  // Pass the adapter here
  history: postgresHistoryAdapter,
});

// Now, when you run the network, it will use your durable adapter
// to manage conversation history.
myNetwork.run("Hello, world!");
```

This modular approach gives you full control over how and where your conversation data is stored.

## How to Test

#### Basic Conversation Persistence

1.  Navigate to `http://localhost:3000`.
2.  Start a conversation and send a few messages.
3.  Refresh the page. The conversation history should be fully restored.
4.  You can use `pnpm run debug-db` to inspect the database and verify messages are stored.

#### Thread Management

1.  Use the "New Chat" button to create several conversations.
2.  Switch between them using the sidebar and see that each one maintains its own context.
3.  Delete a conversation and confirm it's removed from the UI and the database.

## Future Enhancements

This project provides a solid foundation for more advanced features, such as:

- **Database Adapters**: Out-of-the-box adapters for various database providers
- **Progressive Summarization**: Automatic conversation compression for long threads
- **Search & Retrieval**: Semantic search / agentic RAG across conversation history
