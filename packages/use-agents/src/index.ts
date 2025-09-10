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

// === CORE HOOK ===
export { useAgents } from "./frameworks/react/hooks/use-agents/index.js";
export type { UseAgentsReturn, UseAgentsConfig } from "./frameworks/react/hooks/use-agents/types.js";
export { useEphemeralThreads } from "./frameworks/react/hooks/use-ephemeral-threads.js";

// === PROVIDER ===
export { AgentProvider } from "./frameworks/react/components/AgentProvider.js";
export {
  useOptionalGlobalTransport,
  useOptionalGlobalUserId,
  useOptionalGlobalChannelKey,
  useOptionalGlobalResolvedChannelKey,
  useGlobalTransport,
  useGlobalAgentStrict,
  useGlobalTransportStrict,
  useGlobalUserId,
  useGlobalChannelKey,
  useGlobalResolvedChannelKey,
} from "./frameworks/react/components/AgentProvider.js";

// === TRANSPORT (Ports & Adapters) ===
export { createDefaultHttpTransport, DefaultHttpTransport } from "./core/adapters/http-transport.js";
export type { DefaultHttpTransportConfig } from "./core/adapters/http-transport.js";
export { createInMemorySessionTransport, InMemorySessionTransport } from "./core/adapters/session-transport.js";
export type { IClientTransport } from "./core/ports/transport.js";

// === UTILITIES ===
export { formatMessagesToAgentKitHistory } from "./utils/message-formatting.js";
export type { AgentKitMessage } from "./utils/message-formatting.js";

// === CORE TYPES & DEBUG ===
export type { ConversationMessage, Thread, AgentError, AgentStatus } from "./types/index.js";
export { createDebugLogger } from "./types/index.js";

// === ADVANCED (opt-in) ===
export { reduceStreamingState, StreamingEngine, ConnectionManager, ThreadManager } from "./core/index.js";
export type { IConnection, IConnectionSubscription, IConnectionTokenProvider } from "./core/ports/connection.js";
