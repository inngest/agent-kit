/* @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import "../../../../../__tests__/utils/broadcast-channel.ts";
import { useAgents } from "../../../../../index.ts";

describe("useAgents core", () => {
  it("optimistically appends user message and calls transport on success", async () => {
    const sendMessage = vi.fn(async () => {});
    const transport: any = {
      sendMessage,
      cancelMessage: vi.fn(async () => {}),
      approveToolCall: vi.fn(async () => {}),
      getRealtimeToken: vi.fn(async () => ({ token: "t", expires: new Date().toISOString() })),
    };

    const { result } = renderHook(() => useAgents({ transport, debug: false }));

    await act(async () => {
      await result.current.sendMessage("hello world", { messageId: "m-1" });
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const arg = (sendMessage as any).mock.calls[0][0] as any;
    expect(arg.userMessage.content).toBe("hello world");
    expect(typeof arg.threadId).toBe("string");

    await waitFor(() => {
      const last = result.current.messages[result.current.messages.length - 1] as any;
      expect(last?.role).toBe("user");
      const textPart = Array.isArray(last?.parts) ? last.parts.find((p: any) => p?.type === "text") : null;
      expect(textPart?.content).toContain("hello world");
    });
  });

  it("propagates transport error and marks message failed", async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error("boom");
    });
    const transport: any = {
      sendMessage,
      cancelMessage: vi.fn(async () => {}),
      approveToolCall: vi.fn(async () => {}),
      getRealtimeToken: vi.fn(async () => ({ token: "t", expires: new Date().toISOString() })),
    };

    const { result } = renderHook(() => useAgents({ transport, debug: false }));

    await expect(
      act(async () => {
        await result.current.sendMessage("fail", { messageId: "m-2" });
      })
    ).rejects.toThrowError("boom");

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("cancel calls transport with current or fallback thread id", async () => {
    const cancelMessage = vi.fn(async () => {});
    const transport: any = {
      sendMessage: vi.fn(async () => {}),
      cancelMessage,
      approveToolCall: vi.fn(async () => {}),
      getRealtimeToken: vi.fn(async () => ({ token: "t", expires: new Date().toISOString() })),
    };

    const { result } = renderHook(() => useAgents({ transport, debug: false }));

    await act(async () => {
      await result.current.cancel();
    });

    expect(cancelMessage).toHaveBeenCalledTimes(1);
    const arg = (cancelMessage as any).mock.calls[0][0] as any;
    expect(typeof arg?.threadId).toBe("string");
  });

  it("rehydrateMessageState invokes callback with clientState from config", async () => {
    const onStateRehydrate = vi.fn();
    const transport: any = {
      sendMessage: vi.fn(async () => {}),
      cancelMessage: vi.fn(async () => {}),
      approveToolCall: vi.fn(async () => {}),
      getRealtimeToken: vi.fn(async () => ({ token: "t", expires: new Date().toISOString() })),
    };

    const { result } = renderHook(() =>
      useAgents({
        transport,
        debug: false,
        state: () => ({ foo: "bar" }),
        onStateRehydrate,
      })
    );

    await act(async () => {
      await result.current.sendMessage("with-state", { messageId: "m-3" });
    });

    act(() => {
      result.current.rehydrateMessageState("m-3");
    });

    expect(onStateRehydrate).toHaveBeenCalledWith({ foo: "bar" }, "m-3");
  });
});


