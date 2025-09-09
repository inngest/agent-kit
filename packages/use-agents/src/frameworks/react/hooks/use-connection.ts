"use client";

import { useEffect, useRef } from "react";
import { ConnectionManager } from "../../../core/index.js";
import type { IConnection } from "../../../core/ports/connection.js";
import { useInngestSubscription, InngestSubscriptionState } from "@inngest/realtime/hooks";

export function useConnectionSubscription(params: {
  connection: IConnection | null;
  channel: string | null;
  userId?: string | null;
  threadId?: string | null;
  onMessage: (chunk: unknown) => void;
  onStateChange?: (state: unknown) => void;
  debug?: boolean;
  /** Optional: direct token fetcher; when provided, we use the official hook */
  refreshToken?: () => Promise<any>;
}) {
  const { connection, channel, userId, threadId, onMessage, onStateChange, debug, refreshToken } = params;

  // Path 1: Use official realtime hook when a token refresher is provided
  const enabled = Boolean(channel && refreshToken);
  const { data, state, error } = useInngestSubscription({
    key: channel || undefined,
    enabled,
    refreshToken: async () => {
      // Delegate token retrieval
      return await refreshToken!();
    },
  });

  const lastLenRef = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    try {
      onStateChange?.(state);
    } catch {}
  }, [enabled, state, onStateChange]);

  useEffect(() => {
    if (!enabled) return;
    if (!Array.isArray(data)) return;
    // Emit only new chunks since last render
    for (let i = lastLenRef.current; i < data.length; i++) {
      try { onMessage(data[i]); } catch {}
    }
    lastLenRef.current = data.length;
  }, [enabled, data, onMessage]);

  useEffect(() => {
    if (!enabled && (connection && channel)) {
      // Path 2: Use ConnectionManager when no refreshToken provided
      const cm = new ConnectionManager({ connection, debug: Boolean(debug) });
      (async () => {
        try {
          await cm.start({
            channel,
            onMessage,
            onStateChange,
            userId: userId || undefined,
            threadId: threadId || undefined,
          });
        } catch (err) {
          if (debug) console.warn("[useConnectionSubscription] subscribe failed", err);
        }
      })();
      return () => {
        try { cm.stop(); } catch {}
      };
    }
  }, [enabled, connection, channel, userId, threadId, onMessage, onStateChange, debug]);

  // Expose minimal error logging
  useEffect(() => {
    if (!enabled || !error) return;
    if (debug) console.warn("[useConnectionSubscription] realtime error", error);
  }, [enabled, error, debug]);
}


