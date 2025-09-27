import { describe, it, expect, vi } from "vitest";
import { createInngestConnection } from "../../adapters/inngest-connection.js";

describe("InngestConnection (stub)", () => {
  it("subscribes and unsubscribes without throwing", async () => {
    const conn = createInngestConnection();
    const onMessage = vi.fn();
    const onStateChange = vi.fn();

    const sub = await conn.subscribe({
      channel: "test-channel",
      onMessage,
      onStateChange,
    });

    expect(onStateChange).toHaveBeenCalledWith({ status: "stub-connected", channel: "test-channel" });
    expect(() => sub.unsubscribe()).not.toThrow();
    expect(onStateChange).toHaveBeenCalledWith({ status: "stub-disconnected", channel: "test-channel" });
  });
});


