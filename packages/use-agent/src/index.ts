"use client";

/**
 * @inngest/use-agents - React hooks for building AI chat interfaces with AgentKit
 *
 * This package provides a comprehensive set of React hooks for integrating with
 * AgentKit networks and building real-time AI chat applications.
 *
 * ## Core Hooks
 *
 * - `useAgent`: Core real-time streaming hook with multi-thread support
 * - `useChat`: Unified hook combining agent streaming + thread management
 * - `useThreads`: Thread persistence, caching, and pagination management
 *
 * ## Utility Hooks
 *
 * - `useEphemeralThreads`: Client-side thread storage for demos/prototypes
 * - `useConversationBranching`: Message editing and alternate conversation paths
 *
 * ## Core Infrastructure
 *
 * - `AgentProvider`: Global context provider for shared connections
 * - `IClientTransport`: Configurable API layer for all backend communication
 * - Type definitions and utilities for full TypeScript support
 *
 * @example
 * ```typescript
 * import {
 *   useChat,
 *   AgentProvider,
 *   createDefaultHttpTransport
 * } from '@inngest/use-agents';
 *
 * function App() {
 *   return (
 *     <AgentProvider userId="user-123">
 *       <ChatComponent />
 *     </AgentProvider>
 *   );
 * }
 *
 * function ChatComponent() {
 *   const { messages, sendMessage, status } = useChat();
 *   return <Chat messages={messages} onSend={sendMessage} status={status} />;
 * }
 * ```
 *
 * @fileoverview Main exports for @inngest/use-agents package
 */

// Public runtime API
export {
  useAgents,
  useAgents as useAgent,
} from "./frameworks/react/hooks/use-agents/index.js";
export { AgentProvider } from "./frameworks/react/components/AgentProvider.js";
export {
  createDefaultHttpTransport,
  DefaultHttpTransport,
} from "./core/adapters/http-transport.js";
export {
  createInMemorySessionTransport,
  InMemorySessionTransport,
} from "./core/adapters/session-transport.js";
export { formatMessagesToAgentKitHistory } from "./utils/message-formatting.js";
export { createDebugLogger } from "./types/index.js";
export type {
  AgentConfig,
  AgentMessage,
  AgentPart,
  AgentToolPart,
  AnyToolCallPart,
} from "./types/index.js";

// Type exports (do not affect runtime surface)
export type {
  UseAgentsReturn,
  UseAgentsConfig,
  OnEventMeta,
} from "./frameworks/react/hooks/use-agents/types.js";
export type {
  ConversationMessage,
  Thread,
  AgentError,
  AgentStatus,
  ThreadsPage,
  RealtimeEvent,
  AgentKitEvent,
  TypedPartCompletedEvent,
  CrossTabMessage,
  MessagePart,
  TextUIPart,
  ToolCallUIPart,
  DataUIPart,
  FileUIPart,
  SourceUIPart,
  ReasoningUIPart,
  StatusUIPart,
  ErrorUIPart,
  HitlUIPart,
  DebugLogger,
  ErrorClassification,
  ChatRequestPayload,
  ChatRequestEvent,
  ToolManifest,
  TypedToolResult,
  ToolResultPayload,
} from "./types/index.js";
// Note: isTool(part) is exported elsewhere previously; avoid re-exporting non-existent member here.
export { isToolPart, hasToolOutput, getToolData } from "./utils/type-guards.js";
export type {
  ToolName,
  ToolInputOf,
  ToolOutputOf,
  ToolDataOf,
  ToolPartFor,
} from "./types/index.js";
export type { IClientTransport } from "./core/ports/transport.js";
export type { SendMessageParams } from "./core/ports/transport.js";
export type { DefaultHttpTransportConfig } from "./core/adapters/http-transport.js";
export type {
  IConnection,
  IConnectionSubscription,
  IConnectionTokenProvider,
} from "./core/ports/connection.js";
