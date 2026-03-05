import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createAgent } from "../agent";
import { createTool } from "../tool";
import { createMockModel } from "./test-helpers";

describe("Agent standalone run", () => {
  it("runs with a text response", async () => {
    const model = createMockModel({ text: "Hello from agent" });
    const agent = createAgent({
      name: "TestAgent",
      system: "You are a test agent.",
      model,
    });

    const result = await agent.run("Hi");

    expect(result.agentName).toBe("TestAgent");
    expect(result.output).toHaveLength(1);
    expect(result.output[0]!.type).toBe("text");
    if (result.output[0]!.type === "text") {
      expect(result.output[0]!.content).toBe("Hello from agent");
    }
  });

  it("runs with tool calls and executes the tool handler", async () => {
    const model = createMockModel({
      toolCalls: [
        { toolCallId: "c1", toolName: "greet", args: { name: "Alice" } },
      ],
    });

    const agent = createAgent({
      name: "ToolAgent",
      system: "You greet people.",
      model,
      tools: [
        createTool({
          name: "greet",
          description: "Greet someone",
          parameters: z.object({ name: z.string() }),
          handler: ({ name }) => `Hello, ${name}!`,
        }),
      ],
    });

    const result = await agent.run("Greet Alice");

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.content).toEqual({ data: "Hello, Alice!" });
  });

  it("throws when no model is provided", async () => {
    const agent = createAgent({
      name: "NoModel",
      system: "Test",
    });

    await expect(agent.run("Hi")).rejects.toThrow("No model provided");
  });

  it("runs with empty input (system prompt only)", async () => {
    const model = createMockModel({ text: "System-only response" });
    const agent = createAgent({
      name: "SystemOnly",
      system: "You are a system agent.",
      model,
    });

    const result = await agent.run("");

    expect(result.output).toHaveLength(1);
  });
});

describe("Agent.withModel", () => {
  it("returns a new agent with the given model", async () => {
    const model1 = createMockModel({ text: "Response from model 1" });
    const model2 = createMockModel({ text: "Response from model 2" });

    const agent = createAgent({
      name: "Cloneable",
      system: "You are cloneable.",
      model: model1,
    });

    const cloned = agent.withModel(model2);

    expect(cloned.name).toBe("Cloneable");

    const result = await cloned.run("Hi");
    expect(result.output[0]!.type).toBe("text");
    if (result.output[0]!.type === "text") {
      expect(result.output[0]!.content).toBe("Response from model 2");
    }
  });

  it("preserves tools when cloning", async () => {
    const model = createMockModel({
      toolCalls: [
        { toolCallId: "c1", toolName: "ping", args: {} },
      ],
    });

    const agent = createAgent({
      name: "WithTools",
      system: "Test",
      model,
      tools: [
        createTool({
          name: "ping",
          description: "Ping",
          parameters: z.object({}),
          handler: () => "pong",
        }),
      ],
    });

    const cloned = agent.withModel(model);
    expect(cloned.tools.has("ping")).toBe(true);

    const result = await cloned.run("Ping");
    expect(result.toolCalls).toHaveLength(1);
  });
});
