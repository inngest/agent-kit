import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemorySessionTransport } from '../session-transport.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

// Re-import module each test to clear module-level state (threadsByUser)
async function freshTransport(config?: ConstructorParameters<typeof InMemorySessionTransport>[0]) {
  // reset module cache so module-level maps are reset
  vi.resetModules();
  const mod = await import('../session-transport.js');
  const Ctor = mod.InMemorySessionTransport as typeof InMemorySessionTransport;
  return new Ctor(config);
}

describe('InMemorySessionTransport - delegation', () => {
  it('delegates sendMessage to HTTP transport', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, threadId: 'T' }));
    const tr = await freshTransport({ fetch: fetchSpy as unknown as typeof fetch });
    const res = await tr.sendMessage({ userMessage: { id: 'm', content: 'c', role: 'user' }, threadId: 't', history: [] });
    expect(res).toEqual({ success: true, threadId: 'T' });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('delegates getRealtimeToken to HTTP transport', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ token: 'abc' }));
    const tr = await freshTransport({ fetch: fetchSpy as unknown as typeof fetch });
    const res = await tr.getRealtimeToken({});
    expect(res).toEqual({ token: 'abc' });
  });

  it('delegates approveToolCall to HTTP transport', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(undefined, { status: 204 }));
    const tr = await freshTransport({ fetch: fetchSpy as unknown as typeof fetch });
    await tr.approveToolCall({ toolCallId: 'tc', threadId: 't', action: 'approve' });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('cancelMessage is a no-op when HTTP transport lacks it', async () => {
    // Simulate lack of cancel endpoint by deleting the method on the instance
    const fetchSpy = vi.fn(async () => jsonResponse(undefined, { status: 204 }));
    const tr = await freshTransport({ fetch: fetchSpy as unknown as typeof fetch });
    // @ts-expect-error test override to simulate missing cancelMessage on HTTP adapter
    (tr as any).http.cancelMessage = undefined;
    await expect(tr.cancelMessage({ threadId: 't' })).resolves.toBeUndefined();
  });
});

describe('InMemorySessionTransport - in-memory threads', () => {
  it('starts with empty list per user and anon when undefined', async () => {
    const tr = await freshTransport();
    const page = await tr.fetchThreads({});
    expect(page).toMatchObject({ threads: [], hasMore: false, total: 0 });
  });

  it('createThread inserts at front with default title and metadata', async () => {
    const tr = await freshTransport();
    const { threadId, title } = await tr.createThread({ userId: 'u1' });
    expect(typeof threadId).toBe('string');
    expect(title).toBe('New conversation');
    const page = await tr.fetchThreads({ userId: 'u1', limit: 10 });
    expect(page.total).toBe(1);
    expect(page.threads[0].id).toBe(threadId);
    expect(page.threads[0].messageCount).toBe(0);
    expect(page.threads[0].title).toBe('New conversation');
    expect(page.threads[0].createdAt instanceof Date).toBe(true);
    expect(page.threads[0].updatedAt instanceof Date).toBe(true);
    expect(page.threads[0].lastMessageAt instanceof Date).toBe(true);
  });

  it('createThread uses provided title', async () => {
    const tr = await freshTransport();
    const { threadId, title } = await tr.createThread({ userId: 'u1', title: 'Hello' });
    expect(title).toBe('Hello');
    const page = await tr.fetchThreads({ userId: 'u1' });
    expect(page.threads[0].id).toBe(threadId);
    expect(page.threads[0].title).toBe('Hello');
  });

  it('pagination respects limit and offset and hasMore flag', async () => {
    const tr = await freshTransport();
    // create 5 threads for anon
    for (let i = 0; i < 5; i++) {
      await tr.createThread({});
    }
    const p1 = await tr.fetchThreads({ limit: 2 });
    expect(p1.threads).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    expect(p1.total).toBe(5);
    const p2 = await tr.fetchThreads({ limit: 2, offset: 2 });
    expect(p2.threads).toHaveLength(2);
    expect(p2.hasMore).toBe(true);
    const p3 = await tr.fetchThreads({ limit: 2, offset: 4 });
    expect(p3.threads).toHaveLength(1);
    expect(p3.hasMore).toBe(false);
  });

  it('user isolation: different users have independent lists; undefined maps to anon', async () => {
    const tr = await freshTransport();
    const a1 = await tr.createThread({ userId: 'uA', title: 'A1' });
    const a2 = await tr.createThread({ userId: 'uA', title: 'A2' });
    await tr.createThread({ userId: 'uB', title: 'B1' });
    const pA = await tr.fetchThreads({ userId: 'uA' });
    const pB = await tr.fetchThreads({ userId: 'uB' });
    const pAnon = await tr.fetchThreads({});
    expect(pA.total).toBe(2);
    expect(pA.threads[0].title).toBe(a2.title);
    expect(pA.threads[1].title).toBe(a1.title);
    expect(pB.total).toBe(1);
    expect(pAnon.total).toBe(0);
  });

  it('deleteThread removes thread across all users', async () => {
    const tr = await freshTransport();
    const tAnon = await tr.createThread({});
    const tA = await tr.createThread({ userId: 'uA' });
    await tr.deleteThread({ threadId: tAnon.threadId });
    const pAnon = await tr.fetchThreads({});
    expect(pAnon.total).toBe(0);
    const pA = await tr.fetchThreads({ userId: 'uA' });
    expect(pA.total).toBe(1);
    await tr.deleteThread({ threadId: tA.threadId });
    const pA2 = await tr.fetchThreads({ userId: 'uA' });
    expect(pA2.total).toBe(0);
  });

  it('fetchHistory always returns []', async () => {
    const tr = await freshTransport();
    const hist = await tr.fetchHistory({ threadId: 'x' } as any);
    expect(hist).toEqual([]);
  });

  it('cancelMessage passes through when available on HTTP transport', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(undefined, { status: 204 }));
    const tr = await freshTransport({ fetch: fetchSpy as unknown as typeof fetch });
    await expect(tr.cancelMessage?.({ threadId: 't' })).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalled();
  });
});


