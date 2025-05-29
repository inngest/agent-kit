# AgentKit Realtime UI Example

This project demonstrates how to combine [Inngest Realtime](https://www.inngest.com/docs/realtime), and [AgentKit](https://github.com/inngest/agent-kit) to build AI Agent UIs.

## Key Concepts

- **Realtime Streaming:** Uses Inngest Realtime to stream agent responses to the UI as they are generated.
- **Agent-based Architecture:** Two agents are orchestrated:
  - **Database Administrator Agent:** Answers questions about PostgreSQL schema, indexes, and performance.
  - **Security Expert Agent:** Provides guidance on PostgreSQL security, access control, and compliance.
- **Channels & Topics:**
  - Each chat session uses a unique channel (based on a thread ID).
  - Two topics are streamed: `messages` (agent/user messages) and `status` (progress updates).
- **UI/UX:**
  - User questions appear on the right; agent answers stream in on the left.
  - Status updates ("I'm thinking...", errors, completion) are shown inline.
  - Modern, dark-themed chat interface with a styled input and submit button.

## Getting Started

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- An Anthropic API key for Claude

## Getting Started

1. Clone the repository and navigate to the example directory:

   ```bash
   cd examples/realtime-ui-nextjs
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env.local` file with your Anthropic API key:

   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Start the Inngest Dev Server

```bash
npx inngest-cli@latest dev
```

The Inngest Dev Server will start at [http://127.0.0.1:8288/](http://127.0.0.1:8288/).

You can now navigate to the Next.js application at [http://localhost:3000](http://localhost:3000) and start chatting with the Database AI Agent.
