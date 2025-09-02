/**
 * AgentKit React Hooks - Complete toolkit for building AI chat interfaces.
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
 * - `AgentTransport`: Configurable API layer for all backend communication
 * - `AgentProvider`: Global context provider for shared connections
 * - Type definitions and utilities for full TypeScript support
 * 
 * @fileoverview Main exports for AgentKit React hooks package
 */

// === CORE HOOKS ===
export * from "./use-agent";
export * from "./use-chat"; 
export * from "./use-threads";

// === UTILITY HOOKS ===
export * from "./use-ephemeral-threads";
export * from "./use-conversation-branching";
export * from "./use-edit-message";
export * from "./use-message-actions";
export * from "./use-sidebar";
export * from "./use-mobile";

// === INFRASTRUCTURE ===
export * from "./transport";
export * from "./utils/provider-utils";