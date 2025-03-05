# Support Agent with Human-in-the-Loop Example

This AgentKit Support network combines a Supervisor pattern with 2 specialized agents to handle different types of support requests. The Technical Support Agent can request developer input using Human in the Loop.

## Overview

The system consists of three main components:

1. **Customer Support Agent**: Handles general inquiries and ticket updates
2. **Technical Support Agent**: Manages critical tickets and can request developer input
3. **Supervisor Agent**: Routes tickets to appropriate agents based on complexity and criticality

## Key Features

- 🤖 Multiple specialized AI agents
- 🔄 Intelligent ticket routing
- 🔍 Knowledge base and release notes search
- 👥 Human-in-the-loop capability for developer input
- 🎫 Ticket management system integration

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- An Anthropic API key for Claude

## Getting Started

1. Clone the repository and navigate to the example directory:

   ```bash
   cd examples/support-agent-human-in-the-loop
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with your Anthropic API key:

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

Navigate to the Inngest Dev Server runs view: [http://127.0.0.1:8288/functions](http://127.0.0.1:8288/functions).

From there, trigger the `support-agent-workflow` function with your query:

```json
{
  "data": {
    "ticketId": "T125"
  }
}
```

You will be redirected to the runs view where you can see the workflow in action.

At a certain point, the Technical Support Agent will request developer input.

You can then use the "send test event" button at the top right of the page to trigger the `app/support.ticket.developer-response` event as follows:

```json
{
  "data": {
    "ticketId": "T125",
    "response": "The issue was caused by a bug in the API. I have fixed it in the latest release. The API is now working again."
  }
}
```

You will see the support workflow resume with the information you provided and the ticket will be closed.

## How It Works

The system uses a network of specialized agents:

- **Customer Support Agent**: Equipped with tools to search knowledge base and update tickets
- **Technical Support Agent**: Can search release notes and request developer input
- **Supervisor Agent**: Routes tickets based on complexity and manages the workflow

### Tools

1. **Knowledge Base Search**

   - Searches internal knowledge base for relevant articles
   - Used by the Customer Support Agent

2. **Release Notes Search**

   - Searches latest release notes for technical information
   - Used by the Technical Support Agent

3. **Developer Input**

   - Allows Technical Support Agent to request developer assistance
   - Implements a 4-hour timeout for developer response

4. **Ticket Management**
   - Update ticket status, priority, and add notes
   - Track ticket lifecycle

### Workflow

1. New ticket triggers `app/support.ticket.created` event
2. Supervisor Agent evaluates the ticket
3. Ticket is routed to appropriate agent based on complexity
4. Agent processes the ticket using available tools
5. Human intervention is requested if needed
6. Ticket is updated with resolution or escalated

## Events

- `app/support.ticket.created`: Triggers the support workflow
- `app/support.ticket.developer-response`: Handles developer responses

## License

MIT
