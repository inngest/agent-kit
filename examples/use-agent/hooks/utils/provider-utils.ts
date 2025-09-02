/**
 * Provider utilities for optional context access
 * 
 * These utilities allow hooks to gracefully access provider context when available
 * without requiring the provider to be present. This enables both provider-based
 * and standalone usage patterns.
 */

import { 
  useGlobalTransport, 
  useGlobalAgent, 
  useGlobalUserId, 
  useGlobalChannelKey, 
  useGlobalResolvedChannelKey 
} from '@/contexts/AgentContext';
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
