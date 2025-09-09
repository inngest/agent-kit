import { describe, it, expect, vi } from 'vitest';
import { ConnectionManager } from '../connection-manager.js';

describe('ConnectionManager', () => {
  it('subscribes and stops', async () => {
    const unsubscribe = vi.fn();
    const connection = {
      subscribe: vi.fn(async () => ({ unsubscribe })),
    } as any;

    const cm = new ConnectionManager({ connection, debug: true });
    await cm.start({ channel: 'ch', onMessage: () => {}, onStateChange: () => {} });
    expect(connection.subscribe).toHaveBeenCalled();
    cm.stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from "vitest";
import { ConnectionManager } from "../../index.js";

describe("ConnectionManager", () => {
  it("delegates subscribe to underlying adapter", async () => {
    const subscribe = vi.fn().mockResolvedValue({ unsubscribe: vi.fn() });
    const adapter = { subscribe } as any;
    const mgr = new ConnectionManager(adapter);
    const sub = await mgr.subscribe({ channel: "c", onMessage: () => {} });
    expect(subscribe).toHaveBeenCalled();
    expect(typeof sub.unsubscribe).toBe("function");
  });
});


