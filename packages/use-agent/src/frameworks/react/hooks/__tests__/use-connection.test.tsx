/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import "../../../../__tests__/utils/inngest-hook-mock.ts";
import { useConnectionSubscription } from "../use-connection.js";

const mod = await import("../../../../__tests__/utils/inngest-hook-mock.ts");
const controller = (mod as any).controller as {
  push: (c: unknown) => void;
  setState: (s: unknown) => void;
  setError: (e: unknown) => void;
  reset: () => void;
};

describe("use-connection", () => {
  beforeEach(() => {
    controller.reset();
  });

  it("disabled when missing channel or refreshToken", () => {
    const onMessage = vi.fn();
    const onStateChange = vi.fn();
    renderHook(() =>
      useConnectionSubscription({ connection: null, channel: null, onMessage, onStateChange, debug: true })
    );
    controller.push({ x: 1 });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("enabled when channel and refreshToken present; delivers messages and state", async () => {
    const onMessage = vi.fn();
    const onStateChange = vi.fn();
    const refreshToken = vi.fn(async () => ({ token: "t" }));
    const { rerender } = renderHook(() =>
      useConnectionSubscription({ connection: null, channel: "k", onMessage, onStateChange, debug: false, refreshToken })
    );
    act(() => controller.setState("Active"));
    rerender();
    expect(onStateChange).toHaveBeenLastCalledWith("Active");
    act(() => controller.push({ id: 1 }));
    rerender();
    act(() => controller.push({ id: 2 }));
    rerender();
    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it("delivers only new items since last render", () => {
    const onMessage = vi.fn();
    const refreshToken = vi.fn(async () => ({}));
    const { rerender } = renderHook(({ key }) =>
      useConnectionSubscription({ connection: null, channel: key, onMessage, debug: false, refreshToken }),
      { initialProps: { key: "k" } }
    );
    act(() => controller.push({ id: 1 }));
    rerender({ key: "k" });
    expect(onMessage).toHaveBeenCalledTimes(1);
    rerender({ key: "k" });
    act(() => controller.push({ id: 2 }));
    rerender({ key: "k" });
    expect(onMessage).toHaveBeenCalledTimes(2);
  });
});


