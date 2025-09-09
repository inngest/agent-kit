import type { IClientTransport } from "../ports/transport.js";
import type { Thread } from "../../types/index.js";

/**
 * Minimal SessionStorage-based transport for demos and offline mode.
 * Not wired by default; consumers can pass a new SessionStorageTransport().
 */
export class SessionStorageTransport implements IClientTransport {
  private readonly storage: Storage | null;
  private readonly ns: string;

  constructor(namespace = "agentkit") {
    this.storage = typeof window !== "undefined" ? window.sessionStorage : null;
    this.ns = namespace;
  }

  private key(userId?: string) {
    return `${this.ns}:threads:${userId ?? "anon"}`;
  }

  async sendMessage(): Promise<{ success: boolean; threadId: string }> {
    // In session mode, sending is a no-op placeholder.
    return { success: true, threadId: crypto.randomUUID?.() || String(Date.now()) };
  }

  async fetchThreads(options: {
    userId: string;
    channelKey?: string;
    limit: number;
    offset: number;
  }): Promise<{ threads: Thread[]; hasMore: boolean; total: number } & { nextCursorTimestamp?: string | null; nextCursorId?: string | null }> {
    const raw = this.storage?.getItem(this.key(options.userId));
    const parsed: Thread[] = raw ? JSON.parse(raw) : [];
    const slice = parsed.slice(options.offset, options.offset + options.limit);
    return { threads: slice, hasMore: options.offset + options.limit < parsed.length, total: parsed.length };
  }

  async fetchHistory(): Promise<any[]> {
    return [];
  }

  async createThread(options: { userId: string; channelKey?: string }): Promise<{ threadId: string; title: string }> {
    const id = crypto.randomUUID?.() || String(Date.now());
    const now = new Date();
    const thread: Thread = { id, title: "New conversation", messageCount: 0, lastMessageAt: now, createdAt: now, updatedAt: now } as Thread;
    const key = this.key(options.userId);
    const raw = this.storage?.getItem(key);
    const parsed: Thread[] = raw ? JSON.parse(raw) : [];
    parsed.unshift(thread);
    this.storage?.setItem(key, JSON.stringify(parsed));
    return { threadId: id, title: thread.title };
  }

  async deleteThread(): Promise<void> {
    // No-op in this minimal skeleton
  }

  async approveToolCall(): Promise<void> {}

  async getRealtimeToken(): Promise<any> {
    return { token: "session-demo", expires: Date.now() + 60_000 };
  }
}


