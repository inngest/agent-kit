---
"@inngest/agent-kit": minor
---

# Comprehensive AgentKit Enhancements

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
