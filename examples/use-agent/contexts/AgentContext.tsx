"use client";

import React, { createContext, useContext, useRef } from 'react';
import { useAgent, type UseAgentReturn } from '@/hooks/use-agent';
import { TEST_USER_ID } from '@/lib/constants';

interface AgentContextType {
  agent: UseAgentReturn;
}

const AgentContext = createContext<AgentContextType | null>(null);

interface AgentProviderProps {
  children: React.ReactNode;
  userId?: string;
  debug?: boolean;
}

export function AgentProvider({ children, userId = TEST_USER_ID, debug = true }: AgentProviderProps) {
  // Create a stable fallback threadId that only gets generated once
  const fallbackThreadIdRef = useRef<string>(`thread-${Date.now()}`);

  // Create a single stable useAgent instance that persists across navigation
  const agent = useAgent({
    threadId: fallbackThreadIdRef.current, // Start with fallback, will be updated via setCurrentThread
    userId,
    debug,
  });

  return (
    <AgentContext.Provider value={{ agent }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useGlobalAgent(): UseAgentReturn {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useGlobalAgent must be used within an AgentProvider');
  }
  return context.agent;
}
