# Wikipedia Search Agent with Tzafon and Agent Kit

This example demonstrates how to build an AI-powered Wikipedia search agent using AgentKit and [Tzafon](https://www.tzafon.ai/computer). The agent can search Wikipedia for information using natural language queries and return relevant results.

## Features

- 🤖 AI-powered Wikipedia search using GPT-4o mini
- 🌐 Browser automation with Tzafon for reliable web interaction
- 🔍 Semantic search capabilities
- ⚡️ Built with Inngest Agent Kit for robust agent orchestration

## Prerequisites

- Node.js (v20 or later)
- A [Tzafon](https://www.tzafon.ai/dashboard) account and API key. You can find more information in the [docs](https://docs.tzafon.ai/overview).
- An OpenAI API key

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create a `.env` file in the project root with the following variables:

```env
TZAFON_API_KEY=your_tzafon_api_key
OPENAI_API_KEY=your_openai_api_key
```

## How It Works

The example consists of several key components:

1. **Wikipedia Search Tool**: A custom tool built with Tzafon that searches Wikipedia using browser automation.

2. **Search Agent**: An AI agent powered by GPT-4o mini that understands natural language queries and uses the Wikipedia search tool.

3. **Agent Network**: A network configuration that orchestrates the agent's behavior and manages the conversation flow.

The agent uses Tzafon to:

- Create browser sessions
- Navigate to Wikipedia's search interface
- Perform searches
- Extract relevant information

## Usage

1. Start the server:

```bash
pnpm dev
```

The server will start on port 3000.

2. Start the Inngest Dev Server

```bash
npx inngest-cli@latest dev
```

The Inngest Dev Server will start at [http://127.0.0.1:8288/](http://127.0.0.1:8288/).

3. Trigger the function

Navigate to the Inngest Dev Server runs view: [http://127.0.0.1:8288/functions](http://127.0.0.1:8288/functions).

From there, trigger the `wikipedia_search_network` function with your query:

```json
{
  "data": {
    "input": "Who won the super bowl in 2024?"
  }
}
```
