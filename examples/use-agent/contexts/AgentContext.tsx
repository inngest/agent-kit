"use client";

import React, { createContext, useContext, useRef, useMemo, useEffect } from 'react';
import { useAgent, type UseAgentReturn } from '@/hooks/use-agent';
import { 
  type AgentTransport, 
  type DefaultAgentTransportConfig,
  createDefaultAgentTransport 
} from '@/hooks/transport';
import { v4 as uuidv4 } from 'uuid';

/**
 * Context type for AgentProvider - contains shared agent instance and configuration.
 * 
 * This context enables multiple components to share a single AgentKit connection
 * and transport configuration, improving performance and consistency across the app.
 * 
 * @interface AgentContextType
 */
interface AgentContextType {
  /** Shared agent instance with multi-thread capabilities */
  agent: UseAgentReturn;
  /** Transport instance for API calls */
  transport: AgentTransport;
  /** User identifier passed to provider (if any) */
  userId?: string;
  /** Channel key passed to provider (if any) */
  channelKey?: string;
  /** Computed channel key actually used for subscriptions */
  resolvedChannelKey: string;
}

export const AgentContext = createContext<AgentContextType | null>(null);

/**
 * Props for the AgentProvider component.
 * 
 * @interface AgentProviderProps
 */
interface AgentProviderProps {
  /** React children to wrap with agent context */
  children: React.ReactNode;
  /** User identifier for attribution (optional - supports anonymous users) */
  userId?: string;
  /** Channel key for subscription targeting (optional - enables collaboration) */
  channelKey?: string;
  /** Enable debug logging for provider and child hooks (default: true) */
  debug?: boolean;
  /**
   * Transport configuration or instance for API calls.
   * 
   * Can be either:
   * - A complete AgentTransport instance
   * - A configuration object to customize the default transport
   * - Undefined to use default transport with conventional endpoints
   * 
   * @example
   * ```typescript
   * // Configuration object
   * transport={{
   *   api: { sendMessage: '/api/v2/chat' },
   *   headers: { 'Authorization': `Bearer ${token}` }
   * }}
   * 
   * // Transport instance  
   * transport={new CustomAgentTransport()}
   * ```
   */
  transport?: AgentTransport | Partial<DefaultAgentTransportConfig>;
}

/**
 * AgentProvider creates a shared AgentKit connection for multiple chat components.
 * 
 * This provider establishes a single WebSocket connection and transport configuration
 * that can be shared across multiple useAgent, useChat, and useThreads hooks within
 * your application. This improves performance and ensures consistency.
 * 
 * ## Benefits of Using AgentProvider
 * 
 * - **Performance**: Single WebSocket connection shared across components
 * - **Consistency**: Shared transport configuration and user context
 * - **Flexibility**: Child hooks can still override configuration when needed
 * - **Anonymous Support**: Automatically handles anonymous users with persistent IDs
 * - **Channel-based Sharing**: Smart connection sharing based on channel keys
 * 
 * ## Usage Patterns
 * 
 * 1. **Authenticated Users**: `<AgentProvider userId="user-123">`
 * 2. **Anonymous Users**: `<AgentProvider>` (auto-generates persistent anonymous ID)
 * 3. **Collaborative Sessions**: `<AgentProvider channelKey="project-456">`
 * 
 * @param props - Provider configuration
 * @param props.children - React components to provide context to
 * @param props.userId - User identifier (optional - supports anonymous users)
 * @param props.channelKey - Channel key for collaboration (optional)
 * @param props.debug - Enable debug logging (default: true)
 * @param props.transport - Transport configuration or instance (optional)
 * 
 * @example
 * ```typescript
 * // Basic authenticated setup
 * function App() {
 *   return (
 *     <AgentProvider userId="user-123" debug={true}>
 *       <ChatPage />
 *       <ThreadsSidebar />
 *     </AgentProvider>
 *   );
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Anonymous user support
 * function App() {
 *   return (
 *     <AgentProvider debug={false}>
 *       {/* Anonymous ID generated automatically */}
 *       <GuestChatInterface />
 *     </AgentProvider>
 *   );
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Custom transport configuration
 * function App() {
 *   return (
 *     <AgentProvider 
 *       userId="user-123"
 *       transport={{
 *         api: {
 *           sendMessage: '/api/v2/chat',
 *           fetchThreads: '/api/v2/threads'
 *         },
 *         headers: () => ({
 *           'Authorization': `Bearer ${getAuthToken()}`,
 *           'X-User-Role': getUserRole()
 *         })
 *       }}
 *     >
 *       <ChatApp />
 *     </AgentProvider>
 *   );
 * }
 * ```
 */
export function AgentProvider({ children, userId, channelKey, debug = true, transport: transportConfig }: AgentProviderProps) {
  // Create a stable fallback threadId that only gets generated once
  const fallbackThreadIdRef = useRef<string | null>(null);
  if (fallbackThreadIdRef.current === null) {
    fallbackThreadIdRef.current = `thread-${Date.now()}`;
  }

  // === CHANNEL KEY RESOLUTION ===
  // The channel key determines which WebSocket channel to subscribe to.
  // This enables different usage patterns from private chats to collaborative sessions.
  const resolvedChannelKey = useMemo(() => {
    // Priority 1: Explicit channelKey (collaborative/multi-user scenarios)
    // Example: channelKey="project-123" allows multiple users on project-123
    if (channelKey) return channelKey;
    
    // Priority 2: Fallback to userId (private chat - current behavior)
    // Example: userId="user-456" creates private chat for user-456
    if (userId) return userId;
    
    // Priority 3: Anonymous fallback (guest user support)
    // Creates a persistent anonymous ID that survives page reloads
    if (typeof window !== 'undefined') {
      let anonymousId = sessionStorage.getItem("agentkit-anonymous-id");
      if (!anonymousId) {
        anonymousId = `anon_${uuidv4()}`;
        sessionStorage.setItem("agentkit-anonymous-id", anonymousId);
      }
      return anonymousId;
    }
    
    // Server-side/SSR fallback anonymous ID
    return `anon_${uuidv4()}`;
  }, [channelKey, userId]);

  // 🔍 TELEMETRY: Track global agent provider lifecycle
  const providerInstanceId = useRef<string | null>(null);
  if (providerInstanceId.current === null) {
    providerInstanceId.current = `provider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  

  
  // Create or use provided transport instance (memoized for stability)
  const transport = useMemo(() => {
    if (!transportConfig) {
      // No transport provided - use default with conventional endpoints
      return createDefaultAgentTransport();
    }

    if ('sendMessage' in transportConfig && typeof transportConfig.sendMessage === 'function') {
      // It's already a transport instance
      return transportConfig as AgentTransport;
    }

    // It's a configuration object - create default transport with config
    return createDefaultAgentTransport(transportConfig as Partial<DefaultAgentTransportConfig>);
  }, [transportConfig]);
  
  // Create a single stable useAgent instance that persists across navigation
  const agent = useAgent({
    threadId: fallbackThreadIdRef.current, // Start with fallback, will be updated via setCurrentThread
    userId, // Pass userId for attribution (may be undefined for anonymous sessions)
    channelKey: resolvedChannelKey, // Pass resolved channel key for subscription
    debug,
    transport, // Pass transport to useAgent
  });
  

  
  // 🔍 DIAGNOSTIC: Verify provider creates single agent instance
  if (debug) {
    console.log('🔍 [DIAG] AgentProvider created agent:', {
      providerId: providerInstanceId.current,
      userId,
      channelKey,
      resolvedChannelKey,
      fallbackThreadId: fallbackThreadIdRef.current,
      agentConnected: agent?.isConnected || false,
      hasCustomTransport: !!transportConfig,
      timestamp: new Date().toISOString()
    });
  }

  return (
    <AgentContext.Provider value={{ 
      agent, 
      transport, 
      userId,
      channelKey, 
      resolvedChannelKey 
    }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useGlobalAgent(): UseAgentReturn | null {
  const context = useContext(AgentContext);
  return context?.agent || null;
}

/**
 * Get the global transport instance from the AgentProvider.
 * Returns null if used outside of an AgentProvider.
 */
export function useGlobalTransport(): AgentTransport | null {
  const context = useContext(AgentContext);
  return context?.transport || null;
}

// Legacy function that throws - kept for backward compatibility
export function useGlobalAgentStrict(): UseAgentReturn {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useGlobalAgent must be used within an AgentProvider');
  }
  return context.agent;
}

/**
 * Get the global transport instance from the AgentProvider.
 * Throws an error if used outside of an AgentProvider.
 */
export function useGlobalTransportStrict(): AgentTransport {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useGlobalTransport must be used within an AgentProvider');
  }
  return context.transport;
}

/**
 * Get the userId from the AgentProvider.
 * Returns null if used outside of an AgentProvider.
 */
export function useGlobalUserId(): string | null {
  const context = useContext(AgentContext);
  return context?.userId || null;
}

/**
 * Get the channelKey from the AgentProvider.
 * Returns null if used outside of an AgentProvider.
 */
export function useGlobalChannelKey(): string | null {
  const context = useContext(AgentContext);
  return context?.channelKey || null;
}

/**
 * Get the resolved channel key from the AgentProvider.
 * This is the computed value that's actually used for subscriptions.
 * Returns null if used outside of an AgentProvider.
 */
export function useGlobalResolvedChannelKey(): string | null {
  const context = useContext(AgentContext);
  return context?.resolvedChannelKey || null;
}
