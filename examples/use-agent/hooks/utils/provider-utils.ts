/**
 * Provider utilities for optional context access without requiring AgentProvider.
 * 
 * This module enables AgentKit React hooks to work both with and without AgentProvider,
 * implementing a "Provider + Escape Hatch" pattern. Hooks can gracefully inherit
 * configuration from a provider when available, but work independently when needed.
 * 
 * ## Design Philosophy
 * 
 * - **Optional Provider**: Hooks work without AgentProvider (standalone mode)
 * - **Graceful Inheritance**: When provider exists, inherit its configuration
 * - **Override Capability**: Local hook config always takes precedence
 * - **No Exceptions**: Never throw errors when provider is missing
 * 
 * ## Usage Patterns
 * 
 * 1. **Standalone**: Hook creates its own connection and config
 * 2. **Provider Mode**: Hook inherits shared connection and config  
 * 3. **Hybrid**: Hook inherits some config but overrides others
 * 
 * @fileoverview Optional provider integration utilities for AgentKit hooks
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
