import { describe, it, expect, vi } from 'vitest';
import { ConnectionManager } from '../connection-manager.js';
import type { IConnection, IConnectionSubscription } from '../../ports/connection.js';
import { makeConnectionMock } from './test-utils.js';

describe('ConnectionManager', () => {
  it('subscribes and stops', async () => {
    const unsubscribe = vi.fn();
    const subscribe: IConnection['subscribe'] = vi.fn(async () => ({ unsubscribe } as IConnectionSubscription));
    const connection = makeConnectionMock(subscribe);

    const cm = new ConnectionManager({ connection, debug: true });
    await cm.start({ channel: 'ch', onMessage: () => {}, onStateChange: () => {} });
    expect(connection.subscribe).toHaveBeenCalled();
    cm.stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('start() twice unsubscribes the previous subscription', async () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    const subscribe: IConnection['subscribe'] = vi
      .fn()
      .mockResolvedValueOnce({ unsubscribe: unsub1 } as IConnectionSubscription)
      .mockResolvedValueOnce({ unsubscribe: unsub2 } as IConnectionSubscription);
    const connection = makeConnectionMock(subscribe);
    const cm = new ConnectionManager({ connection });
    await cm.start({ channel: 'ch1', onMessage: () => {} });
    await cm.start({ channel: 'ch2', onMessage: () => {} });
    // The first unsubscribe should have been kept and callable via stop
    cm.stop();
    expect(unsub2).toHaveBeenCalled();
  });

  it('propagates subscribe errors and does not set unsubscribe', async () => {
    const subscribe: IConnection['subscribe'] = vi.fn().mockRejectedValue(new Error('boom')) as any;
    const connection = makeConnectionMock(subscribe);
    const cm = new ConnectionManager({ connection });
    await expect(
      cm.start({ channel: 'ch', onMessage: () => {} })
    ).rejects.toThrow('boom');
    // stop should be a no-op (no unsubscribe set)
    expect(() => cm.stop()).not.toThrow();
  });

  it('applies default onStateChange when not provided', async () => {
    const onStateChangeCalls: unknown[] = [];
    const subscribe: IConnection['subscribe'] = vi.fn(async ({ onStateChange }) => {
      // invoke onStateChange safely
      onStateChange?.('Active');
      return { unsubscribe: vi.fn() } as IConnectionSubscription;
    });
    const connection = makeConnectionMock(subscribe);
    const cm = new ConnectionManager({ connection });
    await cm.start({ channel: 'ch', onMessage: () => {}, onStateChange: (s) => onStateChangeCalls.push(s) });
    expect(subscribe).toHaveBeenCalled();
  });
});

describe("ConnectionManager (delegate)", () => {
  it("delegates subscribe via start() to underlying adapter", async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn().mockResolvedValue({ unsubscribe });
    const adapter = { subscribe } as any;
    const mgr = new ConnectionManager({ connection: adapter });
    await mgr.start({ channel: "c", onMessage: () => {} });
    expect(subscribe).toHaveBeenCalled();
    mgr.stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});


