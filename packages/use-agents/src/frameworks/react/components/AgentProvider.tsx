"use client";

import React, { createContext, useContext, useRef, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type IClientTransport } from "../../../core/ports/transport.js";
import {
  type DefaultHttpTransportConfig,
  createDefaultHttpTransport,
} from "../../../core/adapters/http-transport.js";
import { v4 as uuidv4 } from "uuid";
import type {
  IConnection,
  IConnectionTokenProvider,
} from "../../../core/ports/connection.js";
import { createInngestConnection } from "../../../core/adapters/inngest-connection.js";

/**
 * Context type for AgentProvider - contains shared agent instance and configuration.
 *
 * This context enables multiple components to share a single AgentKit connection
 * and transport configuration, improving performance and consistency across the app.
 *
 * @interface AgentContextType
 */
interface AgentContextType {
  /** Transport instance for API calls */
  transport: IClientTransport;
  /** User identifier passed to provider (if any) */
  userId?: string;
  /** Channel key passed to provider (if any) */
  channelKey?: string;
  /** Computed channel key actually used for subscriptions */
  resolvedChannelKey: string;
  /** Internal: connection instance for realtime subscriptions (hex port) */
  connection?: IConnection;
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
   * - A complete IClientTransport instance
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
   * transport={new CustomClientTransport()}
   * ```
   */
  transport?: IClientTransport | Partial<DefaultHttpTransportConfig>;
  /** Optional: provide a custom connection or token provider (hex port seam) */
  connection?: IConnection;
  tokenProvider?: IConnectionTokenProvider;
  /** Optional: supply an existing TanStack Query client; otherwise a default will be created */
  queryClient?: QueryClient;
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
export function AgentProvider({
  children,
  userId,
  channelKey,
  debug = true,
  transport: transportConfig,
  connection: providedConnection,
  tokenProvider,
  queryClient,
}: AgentProviderProps) {
  // Create a stable fallback threadId that only gets generated once
  const fallbackThreadIdRef = useRef<string | null>(null);
  if (fallbackThreadIdRef.current === null) {
    fallbackThreadIdRef.current = uuidv4();
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
    if (typeof window !== "undefined") {
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
      return createDefaultHttpTransport();
    }

    if (
      "sendMessage" in transportConfig &&
      typeof transportConfig.sendMessage === "function"
    ) {
      // It's already a transport instance
      return transportConfig;
    }

    // It's a configuration object - create default transport with config
    return createDefaultHttpTransport(
      transportConfig as Partial<DefaultHttpTransportConfig>
    );
  }, [transportConfig]);

  // Hex port seam: create a connection instance (not yet used by hooks)
  const connection = useMemo<IConnection>(() => {
    // Default token provider pulls from transport per Inngest hooks pattern
    const effectiveTokenProvider: IConnectionTokenProvider | undefined =
      tokenProvider ||
      (transport
        ? {
            getToken: async (params: {
              userId?: string;
              threadId: string;
              channelKey: string;
            }) => {
              const res = await transport.getRealtimeToken({
                userId: params.userId ?? userId,
                threadId: params.threadId,
                channelKey: params.channelKey,
              });
              return {
                token: res.token,
                expires: res.expires,
              };
            },
          }
        : undefined);

    return (
      providedConnection ??
      createInngestConnection({ tokenProvider: effectiveTokenProvider })
    );
  }, [providedConnection, tokenProvider, transport, userId]);

  // 🔍 DIAGNOSTIC
  if (debug) {
    console.log("🔍 [DIAG] AgentProvider ready:", {
      providerId: providerInstanceId.current,
      userId,
      channelKey,
      resolvedChannelKey,
      fallbackThreadId: fallbackThreadIdRef.current,
      hasCustomTransport: !!transportConfig,
      timestamp: new Date().toISOString(),
    });
  }

  // Ensure a QueryClient exists for TanStack Query usage inside hooks
  const localQueryClientRef = useRef<QueryClient | null>(null);
  if (!localQueryClientRef.current) {
    localQueryClientRef.current = new QueryClient();
  }
  const qc = queryClient || localQueryClientRef.current;

  return (
    <QueryClientProvider client={qc}>
      <AgentContext.Provider
        value={{
          transport,
          userId,
          channelKey,
          resolvedChannelKey,
          connection,
        }}
      >
        {children}
      </AgentContext.Provider>
    </QueryClientProvider>
  );
}

// =============================================================================
// PROVIDER UTILITY HOOKS (Merged from provider-utils.ts)
// =============================================================================

/**
 * Hook to safely access global agent from provider.
 * Returns null if no provider is available or if used outside a provider.
 *
 * Note: This hook gracefully handles being used outside of an AgentProvider
 * by catching the context error and returning null.
 */
export function useOptionalGlobalAgent(): null {
  return null;
}

/**
 * Hook to safely access global transport from provider.
 * Returns null if no provider is available or if used outside a provider.
 *
 * Note: This hook gracefully handles being used outside of an AgentProvider
 * by catching the context error and returning null.
 */
export function useOptionalGlobalTransport(): IClientTransport | null {
  try {
    return useGlobalTransport();
  } catch {
    // Not inside an AgentProvider - return null for standalone mode
    return null;
  }
}

/**
 * Hook to safely access global userId from provider.
 * Returns null if no provider is available or if used outside a provider.
 */
export function useOptionalGlobalUserId(): string | null {
  try {
    return useGlobalUserId();
  } catch {
    // Not inside an AgentProvider - return null for standalone mode
    return null;
  }
}

/**
 * Hook to safely access global channelKey from provider.
 * Returns null if no provider is available or if used outside a provider.
 */
export function useOptionalGlobalChannelKey(): string | null {
  try {
    return useGlobalChannelKey();
  } catch {
    // Not inside an AgentProvider - return null for standalone mode
    return null;
  }
}

/**
 * Hook to safely access resolved channel key from provider.
 * This returns the computed channel key that's actually used for subscriptions.
 * Returns null if no provider is available or if used outside a provider.
 */
export function useOptionalGlobalResolvedChannelKey(): string | null {
  try {
    return useGlobalResolvedChannelKey();
  } catch {
    // Not inside an AgentProvider - return null for standalone mode
    return null;
  }
}

// =============================================================================
// DIRECT PROVIDER ACCESS HOOKS (For strict mode)
// =============================================================================

export function useGlobalAgent(): null {
  return null;
}

/**
 * Get the global transport instance from the AgentProvider.
 * Returns null if used outside of an AgentProvider.
 */
export function useGlobalTransport(): IClientTransport | null {
  const context = useContext(AgentContext);
  return context?.transport || null;
}

// Legacy function that throws - kept for backward compatibility
export function useGlobalAgentStrict(): never {
  throw new Error(
    "Global agent is no longer provided; use useAgents hook directly."
  );
}

/**
 * Get the global transport instance from the AgentProvider.
 * Throws an error if used outside of an AgentProvider.
 */
export function useGlobalTransportStrict(): IClientTransport {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useGlobalTransport must be used within an AgentProvider");
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

/**
 * Hook to safely access global connection from provider.
 * Returns null if used outside of an AgentProvider.
 */
export function useOptionalGlobalConnection(): IConnection | null {
  try {
    const context = useContext(AgentContext);
    return context?.connection || null;
  } catch {
    return null;
  }
}
