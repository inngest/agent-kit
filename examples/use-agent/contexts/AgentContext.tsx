"use client";

import React, { createContext, useContext, useRef } from 'react';
import { useAgent, type UseAgentReturn } from '@/hooks/use-agent';
import { TEST_USER_ID } from '@/lib/constants';

interface AgentContextType {
  agent: UseAgentReturn;
}

export const AgentContext = createContext<AgentContextType | null>(null);

interface AgentProviderProps {
  children: React.ReactNode;
  userId?: string;
  debug?: boolean;
}

export function AgentProvider({ children, userId = TEST_USER_ID, debug = true }: AgentProviderProps) {
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
  
  // Create a single stable useAgent instance that persists across navigation
  const agent = useAgent({
    threadId: fallbackThreadIdRef.current, // Start with fallback, will be updated via setCurrentThread
    userId,
    debug,
  });
  
  // 🔍 DIAGNOSTIC: Verify provider creates single agent instance
  console.log('🔍 [DIAG] AgentProvider created agent:', {
    providerId: providerInstanceId.current,
    userId,
    fallbackThreadId: fallbackThreadIdRef.current,
    agentConnected: agent?.isConnected || false,
    timestamp: new Date().toISOString()
  });

  return (
    <AgentContext.Provider value={{ agent }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useGlobalAgent(): UseAgentReturn | null {
  const context = useContext(AgentContext);
  return context?.agent || null;
}

// Legacy function that throws - kept for backward compatibility
export function useGlobalAgentStrict(): UseAgentReturn {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useGlobalAgent must be used within an AgentProvider');
  }
  return context.agent;
}
