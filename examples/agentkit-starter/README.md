# AgentKit - Deep Research

A NextJS application showcasing a deep research agent network built using [AgentKit](https://github.com/inngest/agent-kit). This project contains two distinct implementations: a simple conversational chat and an advanced deep research system.

## Features

- **Simple Chat** (`/`) - Conversational AI with persistent conversation history
- **Deep Research** (`/research`) - Multi-agent deep research system using Exa API
- **Real-time** - Live updates using Inngest realtime
- **Configurable Research Parameters** - Customizable depth, breadth, and scope for research tasks
- **Durable Workflows** - Powered by Inngest for reliable, resumable agent execution

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm package manager

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd agentkit-chat
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:

```env
# Required: OpenAI API key for AI model inference
OPENAI_API_KEY=your_openai_api_key_here

# Required: Exa API key for web search in deep research
EXA_API_KEY=your_exa_api_key_here

```

### Development

Start the development server:

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Building for Production

Build the application:

```bash
pnpm run build
```

Start the production server:

```bash
pnpm run start
```

### Additional Scripts

- `pnpm run lint` - Run ESLint for code quality checks

## Application Routes

### Simple Chat (`/`)

The root route provides a basic conversational AI interface featuring:

- **Persistent History**: Conversation context is maintained across messages
- **Real-time Responses**: Streaming responses from the AI agent
- **AgentKit Integration**: Demonstrates E2E integration with Inngest AgentKit

**Implementation Details:**

- Uses a single `simple_agent` with GPT-4o
- Maintains conversation history through AgentKit's state management
- Streams responses via Inngest's real-time capabilities

### Deep Research (`/research`)

An advanced research system that performs comprehensive analysis on any topic using a multi-agent approach:

- **Multi-Stage Research**: Breaks down complex topics into logical research stages
- **Web Search Integration**: Uses Exa API for high-quality web searches
- **Citation Management**: Automatic IEEE-style citation formatting
- **Configurable Parameters**: Adjustable research depth and breadth
- **Real-time Progress**: Live updates showing research progress and findings

## Deep Research System Architecture

The deep research system employs a sophisticated multi-agent architecture with three specialized agents:

### 1. Staging Agent

**Responsibility**: Creates the research plan and initial query structure

- Analyzes the research topic and context
- Generates a configurable number of research stages (1-5)
- Creates initial depth-0 queries for each stage
- Each stage builds upon insights from previous stages

### 2. Reasoning Agent

**Responsibility**: Executes the research by building reasoning trees

- **Depth 0 Research**: Performs web searches for initial queries
- **Follow-up Generation**: Creates deeper queries based on initial findings
- **Depth 1+ Research**: Searches for follow-up queries to expand knowledge
- **Stage Analysis**: Synthesizes all findings into comprehensive stage reports

**Research Process:**

1. Search web for initial queries (depth 0)
2. Analyze search results and extract key insights
3. Generate follow-up queries based on findings
4. Search for follow-up queries (depth 1+)
5. Create comprehensive stage analysis

### 3. Reporting Agent

**Responsibility**: Synthesizes all research into a final report

- Creates structured report outline based on stage analyses
- Generates detailed sections with proper citations
- Maintains IEEE citation formatting throughout
- Produces a polished, comprehensive research document

## Research Configuration Parameters

The deep research system offers four configurable parameters to customize the research process:

### 1. Max Depth (1-3, default: 2)

Controls how many levels deep the reasoning tree can go:

- **Depth 1**: Only initial queries
- **Depth 2**: Initial queries + one level of follow-ups
- **Depth 3**: Initial queries + two levels of follow-ups

### 2. Max Breadth (2-5, default: 3)

Determines the maximum number of nodes at each depth level:

- Controls parallel search capacity
- Higher values = more comprehensive coverage
- Each node represents a unique search query

### 3. Stage Count (1-5, default: 3)

Number of distinct research stages:

- Each stage focuses on different aspects of the topic
- Stages build progressively from foundational to advanced insights
- More stages = more comprehensive topic coverage

### 4. Queries per Stage (1-5, default: 3)

Initial queries generated for each stage:

- Forms the foundation (depth 0) of each stage's reasoning tree
- Higher values = broader initial coverage per stage

**Example Research Scale:**
With default settings (depth=2, breadth=3, stages=3, queries=3):

- 9 initial queries (3 stages × 3 queries)
- 9 follow-up queries (3 stages × 3 follow-ups)
- **Total: 18 web searches** across 3 comprehensive research stages

## Development Notes

### Inngest Development

The application uses Inngest for durable agent workflows. For local development:

1. Run Inngest dev server: `npx inngest-cli@latest dev`
2. The dev server will automatically discover and register inngest functions`

### Adding New Agents

To add new agents:

1. Create an inngest function and agent network in `inngest/functions/`
2. Register it in `app/api/inngest/route.ts`
3. Create a new API route to stream responses if needed
4. Update your UI to invoke this new endpoint and handle any events you're returning
