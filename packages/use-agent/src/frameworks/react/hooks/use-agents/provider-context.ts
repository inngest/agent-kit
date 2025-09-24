"use client";

import {
  useOptionalGlobalTransport,
  useOptionalGlobalUserId,
  useOptionalGlobalChannelKey,
  useOptionalGlobalResolvedChannelKey,
  useOptionalGlobalConnection,
} from "../../components/AgentProvider.js";

import type { IClientTransport } from "../../../../core/ports/transport.js";
import type { IConnection } from "../../../../core/ports/connection.js";

export interface ProviderContext {
  userId: string | null;
  channelKey: string | null;
  resolvedChannelKey: string | null;
  transport: IClientTransport | null;
  connection: IConnection | null;
}

/**
 * useProviderContext centralizes Provider awareness for the unified hook.
 * Returns null-safe values for user/channel/transport without throwing
 * when there is no enclosing AgentProvider.
 */
export function useProviderContext(): ProviderContext {
  const userId = useOptionalGlobalUserId();
  const channelKey = useOptionalGlobalChannelKey();
  const resolvedChannelKey = useOptionalGlobalResolvedChannelKey();
  const transport = useOptionalGlobalTransport();
  const connection = useOptionalGlobalConnection();

  return { userId, channelKey, resolvedChannelKey, transport, connection };
}

/**
 * Resolve effective identity by combining explicit config with provider values.
 */
export function resolveIdentity(options: {
  configUserId?: string;
  configChannelKey?: string;
  provider: ProviderContext;
}): { userId?: string; channelKey?: string } {
  const userId = options.configUserId || options.provider.userId || undefined;
  const channelKey =
    options.configChannelKey || options.provider.channelKey || undefined;
  return { userId, channelKey };
}

/**
 * Resolve transport by preferring explicit config over provider transport.
 */
export function resolveTransport(
  provided?: IClientTransport | null,
  provider?: ProviderContext
): IClientTransport | null {
  if (provided) return provided;
  return provider?.transport ?? null;
}
