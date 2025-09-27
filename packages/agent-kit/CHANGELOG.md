# @inngest/agent-kit

## 0.13.0

### Minor Changes

- c9b0b16: support for latest version of inngest (3.43.1)
  integrated azure-openai model from @inngest/ai
  migrated to zod v4 and removed zod-to-json-schema package in favor of native z.toJSONSchema()

## 0.12.1

### Patch Changes

- 4a81376: replacing the static import of json-schema-to-zod with a dynamic import() inside the function where it's used to resolve crashing when loading agentkit in a cjs project using require()

## 0.12.0

### Minor Changes

- b175718: # Comprehensive AgentKit Enhancements

  Major improvements to AgentKit with enhanced documentation, new API routes, comprehensive UI components, and example applications.

  ## 📚 Documentation Enhancements

  **New Advanced Pattern Guides:**

  - Added `legacy-ui-streaming.mdx` - Guide for UI streaming with useAgent hook
  - Added `use-chat.mdx` - Comprehensive guide for building chat interfaces
  - Added `use-threads.mdx` - Documentation for managing conversation threads
  - Added `use-agent.mdx` - Updated agent integration patterns

  **Documentation Reorganization:**

  - Moved UI streaming guides to dedicated UI Integration section
  - Enhanced advanced patterns with practical examples
  - Added sequence diagrams and usage guides

  ## ⚡ Revolutionary Automatic Event Streaming System

  **Comprehensive Streaming Architecture:**

  - **StreamingContext**: Hierarchical context management for network/agent runs with shared sequence counters
  - **Event Schema**: 15+ event types covering complete agent lifecycle (run.started, part.created, text.delta, tool calls, HITL, etc.)
  - **Automatic Enrichment**: Events auto-enriched with threadId, userId, and context metadata
  - **Sequence Management**: Monotonic sequence numbering for perfect event ordering across contexts
  - **Parent/Child Contexts**: Seamless context inheritance for agent runs within network runs
  - **Proxy-based Step Wrapper**: Transparent integration with Inngest steps without breaking existing code
  - **Best-effort Publishing**: Graceful error handling that never breaks agent execution
  - **OpenAI-Compatible IDs**: Automatic generation of tool call IDs within OpenAI's 40-character limit

  **Event Types Supported:**

  - **Lifecycle Events**: `run.started`, `run.completed`, `run.failed`, `run.interrupted`
  - **Content Streaming**: `text.delta`, `reasoning.delta`, `data.delta`
  - **Tool Integration**: `tool_call.arguments.delta`, `tool_call.output.delta`
  - **Part Management**: `part.created`, `part.completed`, `part.failed`
  - **HITL Support**: `hitl.requested`, `hitl.resolved`
  - **Metadata & Control**: `usage.updated`, `metadata.updated`, `stream.ended`

  **Developer Experience:**

  - **Zero Configuration**: Automatic context extraction from network state
  - **Debug Logging**: Comprehensive debug output for development
  - **Shared Sequence Counters**: Perfect event ordering across multiple contexts
  - **Flexible Publishing**: Configurable publish functions for any transport

  This streaming system enables real-time UI updates that perfectly match the `useAgent` hook expectations, creating seamless agent-to-UI communication.

  ## 🚀 New API Routes & Backend Features

  **Chat & Communication:**

  - `POST /api/chat` - Main chat endpoint with Zod validation and Inngest integration
  - `POST /api/chat/cancel` - Chat cancellation with run interruption events
  - `POST /api/approve-tool` - Human-in-the-loop tool approval system
  - `POST /api/realtime/token` - Real-time subscription token generation

  **Thread Management:**

  - `GET/POST /api/threads` - Thread listing and creation with pagination
  - `GET/DELETE/PATCH /api/threads/[threadId]` - Individual thread operations
  - Thread title generation and metadata management
  - Support for both authenticated and anonymous users

  **Integration:**

  - `/api/inngest/route` - Inngest function serving with runAgentChat
  - PostgresHistoryAdapter integration for persistent storage

  ## 🎨 Comprehensive UI Component Library

  **AI-Specific Elements:**

  - `Actions` & `Action` - Interactive action buttons with tooltips
  - `Branch` components - Conversation branching and navigation
  - `CodeBlock` - Syntax-highlighted code display with copy functionality
  - `Conversation` - Chat conversation containers with scroll management
  - `Image` - AI-generated image display components
  - `InlineCitation` - Citation cards and source referencing
  - `Loader` - Loading animations and states
  - `Message` components - Message display with avatars and content
  - `PromptInput` - Responsive chat input with model selection
  - `Reasoning` - Agent reasoning display with streaming support
  - `Sources` - Source material display and linking
  - `Suggestion` - AI suggestion chips and interactions
  - `Task` - Task display and management components
  - `Tool` - Tool call display with input/output views
  - `WebPreview` - Web page preview components

  **Chat Interface Components:**

  - `Chat` - Main chat interface with sidebar integration
  - `EmptyState` - Welcome screen with suggestions
  - `ChatHeader` - Header with actions and agent information
  - `ShareDialog` - Thread sharing functionality
  - Message parts for all content types (Text, Tool, Data, File, Source, etc.)
  - `MessageActions` - Copy, edit, regenerate, like/dislike functionality
  - `MessageEditor` - In-place message editing
  - Sidebar components (Desktop & Mobile) with thread management

  **Playground & Development Tools:**

  - `SqlPlayground` - Interactive SQL query interface
  - `SqlEditor` - SQL editing with syntax highlighting
  - `EphemeralChat` - Client-side only chat for demos
  - `MultiChat` - Multiple concurrent chat sessions
  - Tab management for multiple contexts

  **UI Primitives & Layout:**

  - Complete shadcn/ui component library integration
  - `Button`, `Card`, `Dialog`, `Sheet`, `Tabs` and 30+ UI primitives
  - Responsive layouts and mobile-first design
  - Dark/light theme support with CSS custom properties

  ## 🔧 Developer Experience Improvements

  **Example Applications:**

  - Multi-chat interface for concurrent conversations
  - SQL playground with chat integration
  - Thread-based routing (`/chat/[threadId]`)
  - Responsive design patterns

  **Build & Configuration:**

  - Next.js App Router integration
  - Tailwind CSS with custom design system
  - TypeScript throughout with strict type checking
  - Component composition patterns

  **Development Tools:**

  - Hot reload support for rapid development
  - Comprehensive prop interfaces and documentation
  - Modular component architecture
  - Mobile-responsive design patterns

  ## 🎯 Key Benefits

  - **Faster Development**: Pre-built components reduce implementation time
  - **Consistent UX**: Unified design system across all AgentKit applications
  - **Production Ready**: Battle-tested components with proper error handling
  - **Flexible Architecture**: Composable components for custom implementations
  - **Enhanced Documentation**: Clear guides for common integration patterns

  This release significantly enhances the AgentKit ecosystem with production-ready tools for building sophisticated AI chat applications.

## 0.11.0

### Minor Changes

- 81c90df: # Comprehensive AgentKit Enhancements

  Major improvements to AgentKit with enhanced documentation, new API routes, comprehensive UI components, and example applications.

  ## 📚 Documentation Enhancements

  **New Advanced Pattern Guides:**

  - Added `legacy-ui-streaming.mdx` - Guide for UI streaming with useAgent hook
  - Added `use-chat.mdx` - Comprehensive guide for building chat interfaces
  - Added `use-threads.mdx` - Documentation for managing conversation threads
  - Added `use-agent.mdx` - Updated agent integration patterns

  **Documentation Reorganization:**

  - Moved UI streaming guides to dedicated UI Integration section
  - Enhanced advanced patterns with practical examples
  - Added sequence diagrams and usage guides

  ## ⚡ Revolutionary Automatic Event Streaming System

  **Comprehensive Streaming Architecture:**

  - **StreamingContext**: Hierarchical context management for network/agent runs with shared sequence counters
  - **Event Schema**: 15+ event types covering complete agent lifecycle (run.started, part.created, text.delta, tool calls, HITL, etc.)
  - **Automatic Enrichment**: Events auto-enriched with threadId, userId, and context metadata
  - **Sequence Management**: Monotonic sequence numbering for perfect event ordering across contexts
  - **Parent/Child Contexts**: Seamless context inheritance for agent runs within network runs
  - **Proxy-based Step Wrapper**: Transparent integration with Inngest steps without breaking existing code
  - **Best-effort Publishing**: Graceful error handling that never breaks agent execution
  - **OpenAI-Compatible IDs**: Automatic generation of tool call IDs within OpenAI's 40-character limit

  **Event Types Supported:**

  - **Lifecycle Events**: `run.started`, `run.completed`, `run.failed`, `run.interrupted`
  - **Content Streaming**: `text.delta`, `reasoning.delta`, `data.delta`
  - **Tool Integration**: `tool_call.arguments.delta`, `tool_call.output.delta`
  - **Part Management**: `part.created`, `part.completed`, `part.failed`
  - **HITL Support**: `hitl.requested`, `hitl.resolved`
  - **Metadata & Control**: `usage.updated`, `metadata.updated`, `stream.ended`

  **Developer Experience:**

  - **Zero Configuration**: Automatic context extraction from network state
  - **Debug Logging**: Comprehensive debug output for development
  - **Shared Sequence Counters**: Perfect event ordering across multiple contexts
  - **Flexible Publishing**: Configurable publish functions for any transport

  This streaming system enables real-time UI updates that perfectly match the `useAgent` hook expectations, creating seamless agent-to-UI communication.

  ## 🚀 New API Routes & Backend Features

  **Chat & Communication:**

  - `POST /api/chat` - Main chat endpoint with Zod validation and Inngest integration
  - `POST /api/chat/cancel` - Chat cancellation with run interruption events
  - `POST /api/approve-tool` - Human-in-the-loop tool approval system
  - `POST /api/realtime/token` - Real-time subscription token generation

  **Thread Management:**

  - `GET/POST /api/threads` - Thread listing and creation with pagination
  - `GET/DELETE/PATCH /api/threads/[threadId]` - Individual thread operations
  - Thread title generation and metadata management
  - Support for both authenticated and anonymous users

  **Integration:**

  - `/api/inngest/route` - Inngest function serving with runAgentChat
  - PostgresHistoryAdapter integration for persistent storage

  ## 🎨 Comprehensive UI Component Library

  **AI-Specific Elements:**

  - `Actions` & `Action` - Interactive action buttons with tooltips
  - `Branch` components - Conversation branching and navigation
  - `CodeBlock` - Syntax-highlighted code display with copy functionality
  - `Conversation` - Chat conversation containers with scroll management
  - `Image` - AI-generated image display components
  - `InlineCitation` - Citation cards and source referencing
  - `Loader` - Loading animations and states
  - `Message` components - Message display with avatars and content
  - `PromptInput` - Responsive chat input with model selection
  - `Reasoning` - Agent reasoning display with streaming support
  - `Sources` - Source material display and linking
  - `Suggestion` - AI suggestion chips and interactions
  - `Task` - Task display and management components
  - `Tool` - Tool call display with input/output views
  - `WebPreview` - Web page preview components

  **Chat Interface Components:**

  - `Chat` - Main chat interface with sidebar integration
  - `EmptyState` - Welcome screen with suggestions
  - `ChatHeader` - Header with actions and agent information
  - `ShareDialog` - Thread sharing functionality
  - Message parts for all content types (Text, Tool, Data, File, Source, etc.)
  - `MessageActions` - Copy, edit, regenerate, like/dislike functionality
  - `MessageEditor` - In-place message editing
  - Sidebar components (Desktop & Mobile) with thread management

  **Playground & Development Tools:**

  - `SqlPlayground` - Interactive SQL query interface
  - `SqlEditor` - SQL editing with syntax highlighting
  - `EphemeralChat` - Client-side only chat for demos
  - `MultiChat` - Multiple concurrent chat sessions
  - Tab management for multiple contexts

  **UI Primitives & Layout:**

  - Complete shadcn/ui component library integration
  - `Button`, `Card`, `Dialog`, `Sheet`, `Tabs` and 30+ UI primitives
  - Responsive layouts and mobile-first design
  - Dark/light theme support with CSS custom properties

  ## 🔧 Developer Experience Improvements

  **Example Applications:**

  - Multi-chat interface for concurrent conversations
  - SQL playground with chat integration
  - Thread-based routing (`/chat/[threadId]`)
  - Responsive design patterns

  **Build & Configuration:**

  - Next.js App Router integration
  - Tailwind CSS with custom design system
  - TypeScript throughout with strict type checking
  - Component composition patterns

  **Development Tools:**

  - Hot reload support for rapid development
  - Comprehensive prop interfaces and documentation
  - Modular component architecture
  - Mobile-responsive design patterns

  ## 🎯 Key Benefits

  - **Faster Development**: Pre-built components reduce implementation time
  - **Consistent UX**: Unified design system across all AgentKit applications
  - **Production Ready**: Battle-tested components with proper error handling
  - **Flexible Architecture**: Composable components for custom implementations
  - **Enhanced Documentation**: Clear guides for common integration patterns

  This release significantly enhances the AgentKit ecosystem with production-ready tools for building sophisticated AI chat applications.

## 0.9.0

### Minor Changes

- d9507fb: Added support for persistent conversation history via HistoryAdapters
  Created an example NextJS app with realtime responses and thread management

## 0.8.4

### Patch Changes

- fed9545: fixed deserialization of state losing messages and results in Inngest context

## 0.8.3

### Patch Changes

- 2f56454: fixed issue with openai parser not handling responses with both text and tool call parts

## 0.8.2

### Patch Changes

- f09cb8e: Adding recursive check for removing additionalProperties for gemini.

## 0.8.1

### Patch Changes

- f476961: Fixed Gemini adapter response parsing & malformed function call handling

## 0.8.0

### Minor Changes

- e59c6fd: Added support for StreamableHttp in MCP Client

### Patch Changes

- 43a0745: Removed redundant call to this.listMCPTools(server) as we are now using a promises array to handle multiple servers concurrently

  Fixed conditional in MCP client initialization and moved this.\_mcpClients.push(client) to the beginning of listMCPTools method to prevent duplicate clients from being registered

## 0.7.3

### Patch Changes

- 5e3e74f: Export types
- 5e3e74f: Export types from `index.ts`

## 0.7.2

### Patch Changes

- b983424: Add safety checks to openai response parser
- bf01b2f: fix(gemini): do not send `tools` and `tool_config` if not tools are provided

## 0.7.1

### Patch Changes

- f630722: Optimize parallelism in `createServer()`, removing risk of parallel indexing

## 0.7.0

### Minor Changes

- a5f2fea: Refactor AgentResult, and allow conversational history + short term mem

## 0.6.0

### Minor Changes

- e32af3d: Implement typed state management

### Patch Changes

- 51a076c: Document typed state, re-add KV for backcompat
- 7eeadbd: fix(network): add back-compat for `defaultRouter`

## 0.5.1

### Patch Changes

- 3257ff2: fix(mcp): emit valid tool name from MCP tools

## 0.5.0

### Minor Changes

- 9688973: Gemini and Grok support

### Patch Changes

- 13643d9: fix(tools): better support for strict mode + option to opt-out

## 0.4.1

### Patch Changes

- cc44a77: chore: update `inngest` and `@inngest/ai` to latest

## 0.4.0

### Minor Changes

- 7f26053: chore: bump `@inngest/ai` for model hyper params support
  Breaking change: `anthropic()` `max_tokens` options has been moved in `defaultParameters`

### Patch Changes

- c623d8a: fix(models): avoid `parallel_tool_calls` for o3-mini

## 0.3.1

### Patch Changes

- bbb5d1c: Dual publish ESM and CJS

## 0.3.0

### Minor Changes

- 1da7554: fix(index.ts): remove `server` export to allow non-Node runtimes

### Patch Changes

- 9a9f500: fix(openai): tools with no parameters
- 07f2634: feat(models): handle error reponses

## 0.2.2

### Patch Changes

- 1720646: Resolve being unable to find async ctx when using with `inngest`
- ae56867: Use `@inngest/ai` and only optionally use step tooling
- 6b309bb: Allow specifying Inngest functions as tools
- 4d6b263: Shift to pnpm workspace packages; fix linting

## 0.2.1

### Patch Changes

- d40a5c3: fix(adapters/openai): safely parse non-strong tool return value for Function calling

## 0.2.0

### Minor Changes

- c8343c0: Add basic AgentKit server to serve agents and networks as Inngest functions for easy testing
- ec689b8: fix(models/anthropic): ensure that the last message isn't an assistant one

### Patch Changes

- d4a0d26: Update description for npm

## 0.1.2

### Patch Changes

- 4e94cb2: Ensure tools mutate state, not a clone

## 0.1.1

### Patch Changes

- 9f302e4: Network state flow to agents

## 0.1.0

### Minor Changes

- f7158e4: Stepless model/network/agent instantiations

## 0.0.3

### Patch Changes

- 146d976: Fix README links and code examples
- be20dc9: Fix tool usage failing with OpenAI requests

## 0.0.2

### Patch Changes

- 36169d9: Fix GitHub link and add `README.md`

## 0.0.1

### Patch Changes

- 5c78a6a: Initial release!
