/**
 * Provider utilities for optional context access
 * 
 * These utilities allow hooks to gracefully access provider context when available
 * without requiring the provider to be present. This enables both provider-based
 * and standalone usage patterns.
 */

import { useGlobalTransport, useGlobalAgent } from '@/contexts/AgentContext';
import { type AgentTransport } from '../transport';
import type { UseAgentReturn } from '../use-agent';

/**
 * Hook to safely access global transport from provider.
 * Returns null if no provider is available or if used outside a provider.
 * 
 * Note: This hook gracefully handles being used outside of an AgentProvider
 * by catching the context error and returning null.
 */
export function useOptionalGlobalTransport(): AgentTransport | null {
  try {
    return useGlobalTransport();
  } catch {
    // Not inside an AgentProvider - return null for standalone mode
    return null;
  }
}

/**
 * Hook to safely access global agent from provider.
 * Returns null if no provider is available or if used outside a provider.
 * 
 * Note: This hook gracefully handles being used outside of an AgentProvider
 * by catching the context error and returning null.
 */
export function useOptionalGlobalAgent(): UseAgentReturn | null {
  try {
    return useGlobalAgent();
  } catch {
    // Not inside an AgentProvider - return null for standalone mode
    return null;
  }
}
