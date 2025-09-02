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
 * - `useEditMessage`: Simple message editing state management
 * - `useMessageActions`: Copy, like, share, and other message actions
 * - `useSidebar`: Sidebar state management for responsive layouts
 * - `useIsMobile`: Mobile device detection hook
 * 
 * ## Core Infrastructure
 * 
 * - `AgentProvider`: Global context provider for shared connections
 * - `AgentTransport`: Configurable API layer for all backend communication
 * - Type definitions and utilities for full TypeScript support
 * 
 * @example
 * ```typescript
 * import { 
 *   useChat, 
 *   AgentProvider, 
 *   createDefaultAgentTransport 
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

// === UTILITY HOOKS ===
export { useEphemeralThreads } from "./hooks/use-ephemeral-threads.js";
export { useConversationBranching } from "./hooks/use-conversation-branching.js";
export { useEditMessage } from "./hooks/use-edit-message.js";
export { useMessageActions } from "./hooks/use-message-actions.js";
export type { UseMessageActionsOptions } from "./hooks/use-message-actions.js";
export { useSidebar } from "./hooks/use-sidebar.js";
export { useIsMobile } from "./hooks/use-mobile.js";

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
  createDefaultAgentTransport,
  createCustomTransport,
  DefaultAgentTransport
} from "./transport/transport.js";
export type { 
  AgentTransport,
  DefaultAgentTransportConfig,
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
  MultiThreadStreamingState,
  StreamingState,
  
  // Event and action types
  NetworkEvent,
  MultiThreadStreamingAction,
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
