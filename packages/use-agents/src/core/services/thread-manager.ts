import type { ConversationMessage, Thread } from "../../types/index.js";

/**
 * Framework-agnostic thread utilities and manager.
 */
export class ThreadManager {
  mergeThreadsPreserveOrder(localThreads: Thread[], serverThreads: Thread[]): Thread[] {
    const serverById = new Map(serverThreads.map((t) => [t.id, t] as const));

    const updatedLocal = localThreads.map((local) => {
      const server = serverById.get(local.id);
      if (!server) return local;

      const preferredTitle = !isGenericTitle(local.title) &&
        (isGenericTitle(server.title) || (local.title?.length || 0) >= (server.title?.length || 0))
        ? local.title
        : server.title;

      return {
        id: server.id,
        title: preferredTitle,
        messageCount: Math.max(local.messageCount || 0, server.messageCount || 0),
        lastMessageAt: new Date(
          Math.max(new Date(local.lastMessageAt).getTime(), new Date(server.lastMessageAt).getTime())
        ),
        createdAt: new Date(
          Math.min(new Date(local.createdAt).getTime(), new Date(server.createdAt).getTime())
        ),
        updatedAt: new Date(
          Math.max(new Date(local.updatedAt).getTime(), new Date(server.updatedAt).getTime())
        ),
        hasNewMessages: Boolean(local.hasNewMessages || server.hasNewMessages),
      } as Thread;
    });

    const localIds = new Set(localThreads.map((t) => t.id));
    const newFromServer = serverThreads.filter((t) => !localIds.has(t.id));

    const merged = [...updatedLocal, ...newFromServer];
    return this.dedupeThreadsById(merged);
  }

  dedupeThreadsById(threads: Thread[]): Thread[] {
    const seen = new Set<string>();
    const out: Thread[] = [];
    for (const t of threads) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    return out;
  }

  reviveThreadDates<T extends Thread>(thread: T): T {
    return {
      ...thread,
      lastMessageAt: new Date(thread.lastMessageAt),
      createdAt: new Date(thread.createdAt),
      updatedAt: new Date(thread.updatedAt),
    } as T;
  }

  parseCachedThreads(raw: unknown): Thread[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: Thread[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const id = (item as any).id as string | undefined;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(
        this.reviveThreadDates({
          id,
          title: (item as any).title ?? "New conversation",
          messageCount: Number((item as any).messageCount ?? 0),
          lastMessageAt: (item as any).lastMessageAt,
          createdAt: (item as any).createdAt,
          updatedAt: (item as any).updatedAt,
          hasNewMessages: Boolean((item as any).hasNewMessages),
        } as Thread)
      );
    }
    return out;
  }

  buildThreadsCacheKey(userId: string): string {
    return `threads_${userId}`;
  }

  formatRawHistoryMessages(rawMessages: any[]): ConversationMessage[] {
    // Minimal conversion: map to basic UI messages
    return (rawMessages || []).map((msg: any) => {
      if (msg.type === "user") {
        return {
          id: msg.message_id,
          role: "user",
          parts: [
            {
              type: "text",
              id: `text-${msg.message_id}`,
              content: msg.content || "",
              status: "complete",
            },
          ],
          timestamp: new Date(msg.createdAt || msg.created_at || Date.now()),
          status: "sent",
          clientState: msg.clientState,
        } as ConversationMessage;
      }
      return {
        id: msg.message_id,
        role: "assistant",
        parts: [
          {
            type: "text",
            id: `text-${msg.message_id}`,
            content:
              msg.data?.output?.find?.((o: any) => o.type === "text")?.
                content || "",
            status: "complete",
          },
        ],
        timestamp: new Date(msg.createdAt || msg.created_at || Date.now()),
        status: "sent",
      } as ConversationMessage;
    });
  }
}

export function isGenericTitle(title?: string | null): boolean {
  if (!title) return true;
  const t = String(title).trim().toLowerCase();
  return t.length === 0 || t === "new conversation" || t === "new query";
}


