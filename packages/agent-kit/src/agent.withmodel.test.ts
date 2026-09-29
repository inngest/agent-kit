import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createAgent,
  createRoutingAgent,
  createTool,
  openai,
  type MCP,
} from "./index";
import { type HistoryConfig } from "./history";

const tool = createTool({
  name: "lookup",
  parameters: z.object({ q: z.string() }),
  handler: ({ q }) => q,
});

const mcpServers: MCP.Server[] = [
  {
    name: "docs",
    transport: { type: "sse", url: "http://localhost:9999/sse" },
  },
];

const history: HistoryConfig<Record<string, never>> = {
  createThread: () => Promise.resolve({ threadId: "thread-1" }),
};

const otherModel = openai({ model: "gpt-4o", apiKey: "test-key" });

describe("withModel", () => {
  it("keeps tool_choice, mcpServers and history on an agent", () => {
    const agent = createAgent({
      name: "agent",
      system: "system",
      tools: [tool],
      tool_choice: "lookup",
      mcpServers,
      history,
    });

    const copy = agent.withModel(otherModel);

    expect(copy.model).toBe(otherModel);
    expect(copy.tool_choice).toBe("lookup");
    expect(copy.mcpServers).toBe(mcpServers);
    expect(copy["history"]).toBe(history);
  });

  it("keeps tool_choice, mcpServers and history on a routing agent", () => {
    const router = createRoutingAgent({
      name: "router",
      system: "system",
      tools: [tool],
      tool_choice: "any",
      mcpServers,
      history,
      lifecycle: { onRoute: () => undefined },
    });

    const copy = router.withModel(otherModel);

    expect(copy.model).toBe(otherModel);
    expect(copy.tool_choice).toBe("any");
    expect(copy.mcpServers).toBe(mcpServers);
    expect(copy["history"]).toBe(history);
  });

  it("reuses the MCP clients of an agent that already initialized them", async () => {
    const agent = createAgent({ name: "agent", system: "system", mcpServers });
    const client = {} as never;
    agent["_mcpClients"] = [client];

    const copy = agent.withModel(otherModel);
    const connect = vi.spyOn(copy as never, "mcpClient" as never);
    await copy["initMCP"]();

    expect(copy["_mcpClients"]).toEqual([client]);
    expect(connect).not.toHaveBeenCalled();
  });

  it("reuses the MCP clients of a routing agent", async () => {
    const router = createRoutingAgent({
      name: "router",
      system: "system",
      mcpServers,
      lifecycle: { onRoute: () => undefined },
    });
    const client = {} as never;
    router["_mcpClients"] = [client];

    const copy = router.withModel(otherModel);
    const connect = vi.spyOn(copy as never, "mcpClient" as never);
    await copy["initMCP"]();

    expect(copy["_mcpClients"]).toEqual([client]);
    expect(connect).not.toHaveBeenCalled();
  });
});
