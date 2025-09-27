# AgentKit useAgent Hook Demo

This example demonstrates how to build a real-time conversational AI interface using AgentKit with the custom `useAgent` React hook and Inngest Realtime for event streaming.

## Features

- 🤖 **Multi-Agent System**: Customer support network with specialized agents:
  - **Triage Agent**: Routes inquiries to the appropriate specialist
  - **Billing Agent**: Handles payment, subscription, and invoice questions
  - **Technical Support Agent**: Assists with bugs, features, and integrations
- 🚀 **Real-time Streaming**: Live updates as agents think, route, and respond
- 🛠️ **Tool Calling**: Agents can use tools with real-time status updates
- 📊 **Status Tracking**: Visual indicators for agent status and current activity
- 🔄 **Agent Routing**: See which agent is handling your request in real-time

## Prerequisites

- Node.js 18+
- An Inngest account (for real-time event streaming)
- OpenAI API key (or other LLM provider)

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env.local` file:

   ```env
   # LLM Provider API Keys (at least one required)
   OPENAI_API_KEY=your-openai-api-key
   ANTHROPIC_API_KEY=your-anthropic-api-key

   # Inngest (optional for local development)
   INNGEST_EVENT_KEY=your-inngest-event-key
   INNGEST_SIGNING_KEY=your-inngest-signing-key
   ```

3. **Start the Inngest Dev Server:**

   ```bash
   npx inngest-cli@latest dev
   ```

4. **Run the development server:**

   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Architecture

### Frontend (`useAgent` Hook)

The custom `useAgent` hook manages:

- WebSocket connection to Inngest Realtime
- Message state and conversation history
- Real-time event processing
- Agent status tracking

### Backend (Inngest Functions)

- **Agent Network**: Routes between specialized agents based on inquiry type
- **Router-based Event Publishing**: The network router publishes realtime events during each iteration, tracking:
  - Agent routing decisions
  - Text streaming from agents
  - Tool calls and results
  - Status updates
- **Tool Execution**: Handles tool calls with mock implementations

### Event Flow

1. User sends a message via the UI
2. API endpoint triggers Inngest function with the message
3. Agent network processes the request, publishing events
4. Events stream to the frontend via Inngest Realtime
5. UI updates in real-time showing agent activity

## Usage Examples

Try these example queries to see different agents in action:

**Billing Agent:**

- "What's my current subscription status?"
- "I need a refund for last month"
- "Show me my invoice history"

**Technical Support Agent:**

- "The API is returning 500 errors"
- "How do I integrate webhooks?"
- "My dashboard is loading slowly"

**Mixed Queries (showcases routing):**

- "I'm having login issues and need to update my payment method"
- "The billing page is broken and I can't see my invoices"

## Project Structure

```
examples/use-agent/
├── app/
│   ├── api/
│   │   ├── chat/         # Triggers agent execution
│   │   ├── inngest/      # Inngest function endpoint
│   │   └── realtime/     # Subscription token generation
│   └── page.tsx          # Main chat interface
├── components/
│   └── Chat.tsx          # Chat UI component
├── hooks/
│   └── use-agent.ts      # Custom React hook for real-time agent interaction
├── inngest/
│   ├── agents/           # Individual agent definitions
│   └── functions/        # Inngest function implementations
└── lib/
    └── realtime.ts       # Event types and channel definitions
```

## Key Concepts

### Event Types

The system uses structured events for communication:

- `text`: Streaming text responses
- `tool-call`: Tool invocation notifications
- `tool-result`: Tool execution results
- `agent-routed`: Agent routing decisions
- `status`: Status updates (thinking, responding, etc.)
- `error`: Error notifications

### Message Parts

Each message can contain multiple parts, enabling rich interactions:

- Text content with streaming support
- Tool calls with parameters and results
- Status indicators
- Error messages

## Customization

### Adding New Agents

1. Create a new agent in `inngest/agents/`
2. Add it to the network in `inngest/functions/customer-support-network.ts`
3. Update the router logic to include your agent

### Custom Tools

Add tools to agents for extended functionality:

```typescript
const myTool = createTool({
  name: "my_tool",
  description: "Does something useful",
  parameters: z.object({
    param: z.string(),
  }),
  handler: async ({ param }) => {
    // Tool implementation
    return { result: "data" };
  },
});
```

### Styling

The UI uses Tailwind CSS and custom components. Modify the components in `components/ui/` to match your design system.

## Troubleshooting

- **Connection Issues**: Ensure Inngest Dev Server is running
- **No Messages**: Check browser console for errors
- **Agent Errors**: Verify API keys are set correctly

## Learn More

- [AgentKit Documentation](https://github.com/inngest/agent-kit)
- [Inngest Realtime Guide](https://www.inngest.com/docs/guides/realtime)
- [Next.js Documentation](https://nextjs.org/docs)
