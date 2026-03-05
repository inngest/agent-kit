import { describe, it, expect } from "vitest";
import {
  createAgent,
  createRoutingAgent,
  createNetwork,
  createTool,
} from "../index";
import { z } from "zod";
import type { LanguageModelV1 } from "ai";

/**
 * Create a mock LanguageModelV1 for testing.
 * By default returns a text response. Can return tool calls.
 */
function createMockModel(opts?: {
  text?: string;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  /** If provided, this function is called with the prompt to decide the response dynamically. */
  handler?: (prompt: unknown) => {
    text?: string;
    toolCalls?: Array<{
      toolCallType: "function";
      toolCallId: string;
      toolName: string;
      args: string;
    }>;
    finishReason: "stop" | "tool-calls";
  };
}): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: "mock",
    modelId: "mock-model",
    defaultObjectGenerationMode: "json",
    doGenerate: async (options) => {
      if (opts?.handler) {
        const result = opts.handler(options.prompt);
        return {
          text: result.text ?? "",
          toolCalls: result.toolCalls ?? [],
          finishReason: result.finishReason,
          usage: { promptTokens: 0, completionTokens: 0 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      }

      const toolCalls = (opts?.toolCalls ?? []).map((tc) => ({
        toolCallType: "function" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: JSON.stringify(tc.args),
      }));

      return {
        text: opts?.text ?? (toolCalls.length === 0 ? "Mocked response" : ""),
        toolCalls,
        finishReason:
          toolCalls.length > 0
            ? ("tool-calls" as const)
            : ("stop" as const),
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
    doStream: async () => {
      throw new Error("Not implemented");
    },
  };
}

describe("Routing with Done Tool", () => {
  it("should exit network when done tool is called", async () => {
    // Mock model that always calls the "done" tool
    const mockModel = createMockModel({
      toolCalls: [
        {
          toolCallId: "call_123",
          toolName: "done",
          args: { summary: "Task is complete" },
        },
      ],
    });

    const testAgent = createAgent({
      name: "Test Agent",
      description: "A test agent",
      system: "You are a test agent. Always respond with 'Task completed'.",
      model: mockModel,
    });

    const routerThatExits = createRoutingAgent({
      name: "Exit Router",
      description: "Always exits immediately",
      tools: [
        createTool({
          name: "done",
          parameters: z.object({ summary: z.string() }),
          handler: () => {},
        }),
      ],
      lifecycle: {
        onRoute: ({ result }) => {
          if (result.toolCalls[0]?.tool.name === "done") {
            return undefined;
          }
          return undefined;
        },
      },
      system: "Exit immediately",
    });

    const network = createNetwork({
      name: "Test Network",
      agents: [testAgent],
      router: routerThatExits,
      defaultModel: mockModel,
    });

    const result = await network.run("Test input");

    expect(result.state.results.length).toBe(0);
  });

  it("should route to agent then exit with done tool", async () => {
    let routeCount = 0;

    const mockModel = createMockModel();

    const testAgent = createAgent({
      name: "Worker",
      description: "Does work",
      system: "You complete tasks",
      model: mockModel,
    });

    const routeOnceThenExit = createRoutingAgent({
      name: "Route Once Router",
      description: "Routes once then exits",
      tools: [
        createTool({
          name: "done",
          parameters: z.object({ summary: z.string() }),
          handler: () => {},
        }),
      ],
      lifecycle: {
        onRoute: () => {
          routeCount++;

          if (routeCount === 1) {
            return ["Worker"];
          }

          return undefined;
        },
      },
      system: "Route once then exit",
    });

    const network = createNetwork({
      name: "Test Network",
      agents: [testAgent],
      router: routeOnceThenExit,
      defaultModel: mockModel,
    });

    await network.run("Do some work");

    expect(routeCount).toBe(2);
  });

  it("should handle custom done tool properly", async () => {
    const mockModel = createMockModel({
      toolCalls: [
        {
          toolCallId: "call_456",
          toolName: "done",
          args: { summary: "Task is complete" },
        },
      ],
    });

    const customRouter = createRoutingAgent({
      name: "Custom Done Router",
      description: "Uses custom done tool",

      tools: [
        createTool({
          name: "complete_task",
          description: "Mark task as complete",
          parameters: z.object({
            message: z.string(),
          }),
          handler: ({ message }) => {
            return `Completed: ${message}`;
          },
        }),
        createTool({
          name: "done",
          parameters: z.object({ summary: z.string() }),
          handler: () => {},
        }),
      ],

      lifecycle: {
        onRoute: ({ result }) => {
          const tool = result.toolCalls[0];

          if (tool?.tool.name === "complete_task") {
            return undefined;
          }

          return undefined;
        },
      },

      system: "Always call complete_task tool",
      model: mockModel,
    });

    const network = createNetwork({
      name: "Custom Done Network",
      agents: [
        createAgent({
          name: "dummy",
          system: "dummy",
          model: mockModel,
        }),
      ],
      router: customRouter,
      defaultModel: mockModel,
    });

    const result = await network.run("Complete this");

    expect(result).toBeDefined();
  });
});
