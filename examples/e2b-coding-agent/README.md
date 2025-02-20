# E2B Coding Agent Example

This example demonstrates how to create an AI coding agent using AgentKit and E2B's code interpreter. The agent can help users with coding tasks by executing commands in a sandboxed environment, providing a safe and controlled way to run code and terminal commands.

## Features

- 🤖 AI-powered coding assistant using Claude 3.5 Sonnet
- 🏗️ Sandboxed code execution environment using [E2B](https://e2b.dev)
- 🔧 Terminal command execution capabilities
- 🔄 Step-by-step task execution
- 📝 Detailed task summaries

## Prerequisites

Before running this example, you'll need:

- Node.js (v16 or higher)
- pnpm package manager
- An [E2B API key](https://e2b.dev/docs)
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Add your API keys to the `.env` file:

```env
E2B_API_KEY=your_e2b_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## Running the Example

To start the coding agent in development mode with hot reloading:

```bash
pnpm run start "Create a Next.js TodoList demo and its associated unit tests. Finally run the tests with coverage"
```

## How It Works

The example creates an AI coding agent using AgentKit's framework with the following components:

1. **Agent Configuration**: Uses Claude 3.5 Sonnet model for natural language understanding and code generation.

2. **Tools**:

   - Terminal tool for executing commands in a sandboxed environment
   - File system operations
   - Code execution capabilities

3. **Sandbox Environment**: Utilizes E2B's code interpreter to provide a safe environment for running code and commands.

4. **Task Execution**:
   - The agent thinks through tasks step-by-step
   - Executes commands in the sandbox environment
   - Provides detailed summaries of completed tasks
