/* @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { AgentProvider } from "../../../components/AgentProvider.js";
import { useProviderContext, resolveIdentity, resolveTransport } from "../provider-context.js";

describe("provider-context", () => {
  it("returns nulls outside provider", () => {
    function Probe() {
      const ctx = useProviderContext();
      expect(ctx.userId).toBeNull();
      expect(ctx.channelKey).toBeNull();
      expect(ctx.resolvedChannelKey).toBeNull();
      expect(ctx.transport).toBeNull();
      expect(ctx.connection).toBeNull();
      return null;
    }
    render(<Probe />);
  });

  it("returns provider values inside AgentProvider", () => {
    const fakeTransport: any = { id: "transport" };
    const fakeConnection: any = { id: "connection" };
    function Probe() {
      const ctx = useProviderContext();
      expect(ctx.userId).toBe("u1");
      expect(ctx.channelKey).toBe("c1");
      expect(typeof ctx.resolvedChannelKey).toBe("string");
      expect(ctx.transport).toBeTruthy();
      expect(ctx.connection).toBeTruthy();
      return null;
    }
    render(
      <AgentProvider userId="u1" channelKey="c1" transport={fakeTransport} connection={fakeConnection} debug={false}>
        <Probe />
      </AgentProvider>
    );
  });

  it("resolveIdentity prefers config over provider", () => {
    const provider = { userId: "pu", channelKey: "pc", resolvedChannelKey: null, transport: null, connection: null };
    expect(resolveIdentity({ configUserId: "cu", configChannelKey: "cc", provider })).toEqual({ userId: "cu", channelKey: "cc" });
    expect(resolveIdentity({ provider })).toEqual({ userId: "pu", channelKey: "pc" });
  });

  it("resolveTransport prefers provided then provider then null", () => {
    const provider: any = { transport: { id: "pt" } };
    const provided: any = { id: "ct" };
    expect(resolveTransport(provided, provider as any)).toBe(provided);
    expect(resolveTransport(null, provider as any)).toBe(provider.transport);
    expect(resolveTransport()).toBeNull();
  });
});


