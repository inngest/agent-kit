"use client";

import React, { createContext, useContext, useRef, useMemo, useEffect } from 'react';
import { useAgent, type UseAgentReturn } from '@/hooks/use-agent';
import { TEST_USER_ID } from '@/lib/constants';
import { 
  type AgentTransport, 
  type DefaultAgentTransportConfig,
  createDefaultAgentTransport 
} from '@/hooks/transport';

interface AgentContextType {
  agent: UseAgentReturn;
  transport: AgentTransport;
}

export const AgentContext = createContext<AgentContextType | null>(null);

interface AgentProviderProps {
  children: React.ReactNode;
  userId?: string;
  debug?: boolean;
  /**
   * Optional transport configuration or instance.
   * If not provided, a default transport with conventional endpoints will be used.
   */
  transport?: AgentTransport | Partial<DefaultAgentTransportConfig>;
}

export function AgentProvider({ children, userId = TEST_USER_ID, debug = true, transport: transportConfig }: AgentProviderProps) {
  // Create a stable fallback threadId that only gets generated once
  const fallbackThreadIdRef = useRef<string | null>(null);
  if (fallbackThreadIdRef.current === null) {
    fallbackThreadIdRef.current = `thread-${Date.now()}`;
  }

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
    userId,
    debug,
    transport, // Pass transport to useAgent
  });
  

  
  // 🔍 DIAGNOSTIC: Verify provider creates single agent instance
  console.log('🔍 [DIAG] AgentProvider created agent:', {
    providerId: providerInstanceId.current,
    userId,
    fallbackThreadId: fallbackThreadIdRef.current,
    agentConnected: agent?.isConnected || false,
    hasCustomTransport: !!transportConfig,
    timestamp: new Date().toISOString()
  });

  return (
    <AgentContext.Provider value={{ agent, transport }}>
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
