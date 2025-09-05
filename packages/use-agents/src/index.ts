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

// === CORE HOOKS ===
export { useAgent } from "./hooks/use-agent.js";
export type { UseAgentReturn } from "./hooks/use-agent.js";

export { useChat } from "./hooks/use-chat.js";
export type { UseChatReturn, UseChatConfig } from "./hooks/use-chat.js";

export { useThreads } from "./hooks/use-threads.js";
export type { UseThreadsReturn } from "./hooks/use-threads.js";

// New unified hook (Phase 1)
export { useAgents } from "./hooks/use-agents/index.js";
export type { UseAgentsReturn, UseAgentsConfig } from "./hooks/use-agents/types.js";

// === UTILITY HOOKS ===
export { useEphemeralThreads } from "./hooks/use-ephemeral-threads.js";
export { useConversationBranching } from "./hooks/use-conversation-branching.js";

// === PROVIDER ===
export { 
  AgentProvider,
  useOptionalGlobalAgent,
  useOptionalGlobalTransport,
  useOptionalGlobalUserId,
  useOptionalGlobalChannelKey,
  useOptionalGlobalResolvedChannelKey,
  useGlobalAgent,
  useGlobalTransport,
  useGlobalAgentStrict,
  useGlobalTransportStrict,
  useGlobalUserId,
  useGlobalChannelKey,
  useGlobalResolvedChannelKey
} from "./components/AgentProvider.js";

// === TRANSPORT ===
export { 
  createDefaultHttpTransport,
  createCustomTransport,
  DefaultHttpTransport
} from "./transport/transport.js";
export type { 
  IClientTransport,
  DefaultHttpTransportConfig,
  SendMessageParams,
  FetchThreadsParams,
  FetchHistoryParams,
  CreateThreadParams,
  DeleteThreadParams,
  GetRealtimeTokenParams,
  ApproveToolCallParams,
  RequestOptions
} from "./transport/transport.js";

// === UTILITIES ===
export { formatMessagesToAgentKitHistory } from "./utils/message-formatting.js";
export type { AgentKitMessage } from "./utils/message-formatting.js";

// === CORE TYPES ===
export type {
  // Core message types
  ConversationMessage,
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
  
  // State and status types
  AgentStatus,
  Thread,
  ThreadState,
  StreamingState,
  
  // Event and action types
  NetworkEvent,
  StreamingAction,
  
  // Configuration types
  UseAgentOptions,
  
  // Error types
  AgentError,
  ErrorClassification,
  
  // Token types
  RealtimeToken,
  AgentMessageChunk,
  
  // Debug utilities
  DebugLogger
} from "./types/index.js";

// === DEBUG UTILITIES ===
export { createDebugLogger, createAgentError, classifyError } from "./types/index.js";
