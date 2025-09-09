"use client";

import type { IClientTransport } from "../../../../core/ports/transport.js";

/**
 * Factory for thin transport helpers used by useAgents. Each helper prefers the
 * provided IClientTransport if available; otherwise it falls back to conventional
 * REST endpoints used by the example app.
 */
export function createTransportHelpers(transport: IClientTransport | null, channelKey?: string | null) {
  return {
    async fetchThreads(userId: string, pagination: { limit: number; offset?: number; cursorTimestamp?: string; cursorId?: string }) {
      if (transport) {
        return transport.fetchThreads({
          userId,
          channelKey: channelKey || undefined,
          limit: pagination.limit,
          offset: pagination.offset ?? 0,
          cursorTimestamp: pagination.cursorTimestamp,
          cursorId: pagination.cursorId,
        } as any);
      }

      const params = new URLSearchParams();
      params.set("userId", userId);
      params.set("limit", String(pagination.limit));
      if (pagination.cursorTimestamp && pagination.cursorId) {
        params.set("cursorTimestamp", pagination.cursorTimestamp);
        params.set("cursorId", pagination.cursorId);
      } else {
        params.set("offset", String(pagination.offset ?? 0));
      }
      if (channelKey) params.set("channelKey", channelKey);

      const res = await fetch(`/api/threads?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load threads (${res.status})`);
      return res.json();
    },

    async fetchHistory(threadId: string) {
      if (transport) {
        return transport.fetchHistory({ threadId });
      }
      const res = await fetch(`/api/threads/${threadId}`);
      if (!res.ok) throw new Error(`Failed to fetch thread history (${res.status})`);
      const data = await res.json();
      return data.messages;
    },

    async createThread(userId: string) {
      if (transport) {
        return transport.createThread({ userId, channelKey: channelKey || undefined });
      }
      const body: any = { userId };
      if (channelKey) body.channelKey = channelKey;
      const res = await fetch(`/api/threads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Failed to create thread (${res.status})`);
      return res.json();
    },

    async deleteThread(threadId: string) {
      if (transport) {
        return transport.deleteThread({ threadId });
      }
      const res = await fetch(`/api/threads/${threadId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete thread (${res.status})`);
    },
  };
}


