# Reddit Search Agent with Browserbase and Agent Kit

This example demonstrates how to build an AI-powered Reddit search agent using AgentKit and [Browserbase](https://docs.browserbase.com/). The agent can search Reddit posts and comments using natural language queries and return relevant results.

## Features

- 🤖 AI-powered Reddit search using Claude 3.5 Sonnet
- 🌐 Browser automation with Browserbase for reliable web scraping
- 🔍 Semantic search capabilities
- ⚡️ Built with Inngest Agent Kit for robust agent orchestration

## Prerequisites

- Node.js (v16 or later)
- A Browserbase account and API key
- An Anthropic API key for Claude

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root with the following variables:

```env
BROWSERBASE_API_KEY=your_browserbase_api_key
BROWSERBASE_PROJECT_ID=your_browserbase_project_id
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## How It Works

The example consists of several key components:

1. **Reddit Search Tool**: A custom tool built with Browserbase that scrapes Reddit search results using browser automation.

2. **Search Agent**: An AI agent powered by Claude 3.5 that understands natural language queries and uses the Reddit search tool.

3. **Agent Network**: A network configuration that orchestrates the agent's behavior and manages the conversation flow.

The agent uses Browserbase to:

- Create browser sessions
- Navigate to Reddit's search interface
- Extract relevant post information
- Handle browser automation reliably

## Usage

1. Start the server:

```bash
npm start
```

The server will start on port 3010.

2. Start the Inngest Dev Server

```bash
npx inngest-cli@latest dev
```

The Inngest Dev Server will start at [http://127.0.0.1:8288/](http://127.0.0.1:8288/).

## Usage

Navigate to the Inngest Dev Server runs view: [http://127.0.0.1:8288/functions](http://127.0.0.1:8288/functions).

From there, trigger the `reddit-search-network` function with your query:

```json
{
  "data": {
    "input": "What are people saying about Rust vs Go?"
  }
}
```

## License

[MIT License](LICENSE)
