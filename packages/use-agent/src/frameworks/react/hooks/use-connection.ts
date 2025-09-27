"use client";

import { useEffect, useRef } from "react";
import type { IConnection } from "../../../core/ports/connection.js";
import { useInngestSubscription } from "@inngest/realtime/hooks";

/**
 * NOTE (2025-09): Realtime subscriptions require a token.
 * We currently rely on the official `useInngestSubscription` path when a
 * `refreshToken` handler is provided. The previous fallback path using
 * `ConnectionManager` has been disabled to make token usage explicit.
 *
 * Plan: We'll replace the React hook with a framework-agnostic connection
 * adapter (`InngestConnection`) managed via `ConnectionManager`, and use
 * `useSyncExternalStore` to bridge into React.
 */
export function useConnectionSubscription(params: {
  connection: IConnection | null;
  channel: string | null;
  onMessage: (chunk: unknown) => void;
  onStateChange?: (state: unknown) => void;
  debug?: boolean;
  /** Optional: direct token fetcher; when provided, we use the official hook */
  refreshToken?: () => Promise<unknown>;
}) {
  const { channel, onMessage, onStateChange, debug, refreshToken } = params;

  // Token is required for realtime subscriptions
  const enabled = Boolean(channel && refreshToken);
  type SubscriptionOptions = {
    key?: string;
    enabled?: boolean;
    refreshToken: () => Promise<unknown>;
  };
  const subOptions: SubscriptionOptions = {
    key: channel || undefined,
    enabled,
    refreshToken: async () => {
      return await refreshToken!();
    },
  };

  const { data, state, error } = useInngestSubscription(
    subOptions as unknown as Parameters<typeof useInngestSubscription>[0]
  );

  const lastLenRef = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    try {
      onStateChange?.(state);
    } catch (err) {
      if (debug)
        console.warn("[useConnectionSubscription] state handler error", err);
    }
  }, [enabled, state, onStateChange]);

  useEffect(() => {
    if (!enabled) return;
    if (!Array.isArray(data)) return;
    for (let i = lastLenRef.current; i < data.length; i++) {
      try {
        onMessage(data[i]);
      } catch (err) {
        if (debug)
          console.warn(
            "[useConnectionSubscription] message handler error",
            err
          );
      }
    }
    lastLenRef.current = data.length;
  }, [enabled, data, onMessage]);

  // Minimal error logging / diagnostics
  useEffect(() => {
    if (enabled || !channel) return;
    if (debug)
      console.warn(
        "[useConnectionSubscription] Token is required; realtime disabled (channel=",
        channel,
        ")"
      );
  }, [enabled, channel, debug]);

  useEffect(() => {
    if (!enabled || !error) return;
    if (debug)
      console.warn("[useConnectionSubscription] realtime error", error);
  }, [enabled, error, debug]);
}
