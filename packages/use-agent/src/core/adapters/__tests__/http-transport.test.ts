import { describe, it, expect, vi } from 'vitest';
import { DefaultHttpTransport } from '../http-transport.js';

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('DefaultHttpTransport - basics', () => {
  it('uses injected fetch function when provided', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ success: true, threadId: 't1' })
    );
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });

    const res = await transport.sendMessage(
      {
        userMessage: { id: 'm1', content: 'hi', role: 'user' },
        threadId: 'thr',
        history: [],
      },
      { headers: { 'X-Test': '1' } }
    );

    expect(res).toEqual({ success: true, threadId: 't1' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]! as unknown as FetchCall;
    const [url, init] = call;
    expect(String(url)).toBe('/api/chat');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Test': '1' });
  });

  it('falls back to global fetch when not injected', async () => {
    const origFetch = globalThis.fetch;
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, threadId: 't2' }));
    (globalThis as any).fetch = fetchSpy as typeof fetch;
    try {
      const transport = new DefaultHttpTransport();
      const res = await transport.sendMessage(
        { userMessage: { id: 'm1', content: 'x', role: 'user' }, threadId: 't', history: [] },
        {}
      );
      expect(res.threadId).toBe('t2');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('DefaultHttpTransport - URL building and params', () => {
  it('prefixes baseURL for relative endpoints', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, threadId: 't3' }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch, baseURL: 'https://api.example.com' });

    await transport.sendMessage({ userMessage: { id: 'm', content: 'c', role: 'user' }, threadId: 'th', history: [] });
    const [url] = (fetchSpy.mock.calls[0]! as unknown as FetchCall);
    expect(String(url)).toBe('https://api.example.com/api/chat');
  });

  it('does not prefix baseURL for absolute endpoints', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ threads: [], hasMore: false, total: 0 }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch, baseURL: 'https://base.invalid', api: { fetchThreads: 'https://abs.example.com/threads' } as any });
    await transport.fetchThreads({ limit: 5 }, {});
    const [url, init] = (fetchSpy.mock.calls[0]! as unknown as FetchCall);
    expect(String(url)).toMatch(/^https:\/\/abs\.example\.com\/threads\?/);
    expect(init?.method).toBe('GET');
  });

  it('replaces path params and URI-encodes values', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ messages: [] }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    await transport.fetchHistory({ threadId: 'a b/c' });
    const [url] = (fetchSpy.mock.calls[0]! as unknown as FetchCall);
    expect(String(url)).toBe('/api/threads/a%20b%2Fc');
  });
});

describe('DefaultHttpTransport - headers and body merging', () => {
  it('merges default headers with per-call headers (call overrides)', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, threadId: 't4' }));
    const transport = new DefaultHttpTransport({
      fetch: fetchSpy as unknown as typeof fetch,
      headers: async () => ({ 'Content-Type': 'application/json', 'X-Default': 'A' }),
    });
    await transport.createThread(
      { title: 'x' },
      { headers: { 'X-Default': 'B', 'X-Other': 'C' } }
    );
    const [, init] = (fetchSpy.mock.calls[0]! as unknown as FetchCall);
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Default': 'B', 'X-Other': 'C' });
  });

  it('merges default body with request body objects', async () => {
    const capturedBodies: string[] = [];
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') capturedBodies.push(init.body);
      return jsonResponse({ success: true, threadId: 't5' });
    });
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch, body: () => ({ d: 1 }) });
    await transport.sendMessage(
      { userMessage: { id: 'm', content: 'c', role: 'user' }, threadId: 'th', history: [], userId: 'u1' },
      { body: { x: 2 } }
    );
    const payload = JSON.parse(capturedBodies[0]);
    expect(payload).toMatchObject({ d: 1, x: 2, userId: 'u1', threadId: 'th' });
  });

  // sendMessage always constructs an object payload; string bodies are not applicable here
});

describe('DefaultHttpTransport - method semantics and query params', () => {
  it('GET and DELETE requests do not send a body', async () => {
    const seenBodies: Array<RequestInit['body']> = [];
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      seenBodies.push(init?.body);
      if (init?.method === 'GET') return jsonResponse({ messages: [] });
      if (init?.method === 'DELETE') return jsonResponse(undefined, { status: 204 });
      return jsonResponse({});
    });
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    await transport.fetchHistory({ threadId: 't' });
    await transport.deleteThread({ threadId: 't' });
    expect(seenBodies).toEqual([undefined, undefined]);
  });

  it('fetchThreads builds query with limit default, cursor over offset, and userId over channelKey', async () => {
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL) => jsonResponse({ threads: [], hasMore: false, total: 0 }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });

    // default limit=20
    await transport.fetchThreads({});
    let [url1] = (fetchSpy.mock.calls.at(-1)! as unknown as FetchCall);
    expect(String(url1)).toContain('limit=20');

    // cursor pair overrides offset
    await transport.fetchThreads({ cursorTimestamp: 'ts', cursorId: 'id', offset: 10 });
    let [url2] = (fetchSpy.mock.calls.at(-1)! as unknown as FetchCall);
    expect(String(url2)).toContain('cursorTimestamp=ts');
    expect(String(url2)).toContain('cursorId=id');
    expect(String(url2)).not.toContain('offset=');

    // userId preferred over channelKey
    await transport.fetchThreads({ userId: 'u', channelKey: 'ck' });
    let [url3] = (fetchSpy.mock.calls.at(-1)! as unknown as FetchCall);
    expect(String(url3)).toContain('userId=u');
    expect(String(url3)).not.toContain('channelKey=ck');
  });
});

describe('DefaultHttpTransport - response handling and errors', () => {
  it('returns parsed JSON for 2xx', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ token: 'abc' }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    const res = await transport.getRealtimeToken({});
    expect(res).toEqual({ token: 'abc' });
  });

  it('returns undefined for 204 responses', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(undefined, { status: 204 }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    const res = await transport.deleteThread({ threadId: 't' });
    expect(res).toBeUndefined();
  });

  it('throws with nested error message when present', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'nested' } }), { status: 400, statusText: 'Bad Request', headers: { 'Content-Type': 'application/json' } }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    await expect(
      transport.createThread({ title: 'x' })
    ).rejects.toMatchObject({ message: 'nested' });
  });

  it('throws with top-level message when present', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ message: 'top-level' }), { status: 422, statusText: 'Unprocessable', headers: { 'Content-Type': 'application/json' } }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    await expect(
      transport.createThread({ title: 'x' })
    ).rejects.toMatchObject({ message: 'top-level' });
  });

  it('throws with HTTP status message when response JSON is invalid', async () => {
    const fetchSpy = vi.fn(async () => new Response('not-json', { status: 500, statusText: 'Internal Server Error', headers: { 'Content-Type': 'text/plain' } }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    await expect(
      transport.createThread({ title: 'x' })
    ).rejects.toMatchObject({ message: 'HTTP 500: Internal Server Error' });
  });

  it('attaches agentError with recoverability classification', async () => {
    const fetchSpy = vi.fn(async () => new Response('nope', { status: 500, statusText: 'Server Error' }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    try {
      await transport.approveToolCall({ toolCallId: 'tc', threadId: 't', action: 'approve' });
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.agentError).toBeDefined();
      expect(err.agentError.recoverable).toBe(true);
    }
  });
});

describe('DefaultHttpTransport - specific endpoints', () => {
  it('approveToolCall sends required fields', async () => {
    const capturedBodies: any[] = [];
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') capturedBodies.push(JSON.parse(init.body));
      return jsonResponse(undefined, { status: 204 });
    });
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    await transport.approveToolCall({ toolCallId: 'tc1', threadId: 't1', action: 'approve', reason: 'ok' });
    expect(capturedBodies[0]).toMatchObject({ toolCallId: 'tc1', threadId: 't1', action: 'approve', reason: 'ok' });
  });

  it('cancelMessage throws when endpoint not configured', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(undefined, { status: 204 }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch, api: { cancelMessage: undefined as any } as any });
    await expect(transport.cancelMessage({ threadId: 't' })).rejects.toThrow('cancelMessage endpoint not configured');
  });

  it('passes AbortSignal through to fetch', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, threadId: 't7' }));
    const transport = new DefaultHttpTransport({ fetch: fetchSpy as unknown as typeof fetch });
    const ac = new AbortController();
    await transport.sendMessage(
      { userMessage: { id: 'm', content: 'c', role: 'user' }, threadId: 't', history: [] },
      { signal: ac.signal }
    );
    const [, init] = (fetchSpy.mock.calls[0]! as unknown as FetchCall);
    expect(init?.signal).toBe(ac.signal);
  });
});


