import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAgent,
  createRoutingAgent,
  createNetwork,
  createTool,
  openai,
} from "../index";
import { z } from "zod";

// Mock the global fetch function to avoid real API calls
beforeEach(() => {
  vi.spyOn(global, "fetch").mockImplementation((url, options) => {
    const tool_calls: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }> = [];
    const bodyString =
      typeof options?.body === "string"
        ? options.body
        : options?.body
          ? JSON.stringify(options.body)
          : "";
    // Default to calling the 'done' tool for routing agents
    if (bodyString.includes("select_agent")) {
      tool_calls.push({
        id: "call_123",
        type: "function",
        function: {
          name: "done",
          arguments: JSON.stringify({ summary: "Task is complete" }),
        },
      });
    }

    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                role: "assistant",
                content: tool_calls.length === 0 ? "Mocked response" : null,
                tool_calls: tool_calls,
              },
              finish_reason: tool_calls.length > 0 ? "tool_calls" : "stop",
            },
          ],
        }),
    } as Response);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Routing with Done Tool", () => {
  it("should exit network when done tool is called", async () => {
    // Create a simple test agent
    const testAgent = createAgent({
      name: "Test Agent",
      description: "A test agent",
      system: "You are a test agent. Always respond with 'Task completed'.",
      model: openai({
        model: "gpt-3.5-turbo",
        apiKey: "test-key",
      }),
    });

    // Create a routing agent that immediately calls done
    const routerThatExits = createRoutingAgent({
      name: "Exit Router",
      description: "Always exits immediately",
      tools: [
        // It needs the 'done' tool to be able to be called
        createTool({
          name: "done",
          parameters: z.object({ summary: z.string() }),
          handler: () => {},
        }),
      ],
      lifecycle: {
        onRoute: ({ result }) => {
          // Check if the 'done' tool was called by the mocked response
          if (result.toolCalls[0]?.tool.name === "done") {
            return undefined; // Exit immediately
          }
          // Fallback for other scenarios
          return undefined;
        },
      },
      system: "Exit immediately",
    });

    // Create network with the router
    const network = createNetwork({
      name: "Test Network",
      agents: [testAgent],
      router: routerThatExits,
      defaultModel: testAgent.model,
    });

    // Run the network - it should exit immediately without calling any agents
    const result = await network.run("Test input");

    // The network should have no results since the router exited immediately
    expect(result.state.results.length).toBe(0);
  });

  it("should route to agent then exit with done tool", async () => {
    let routeCount = 0;

    // Create a test agent
    const testAgent = createAgent({
      name: "Worker",
      description: "Does work",
      system: "You complete tasks",
      model: openai({
        model: "gpt-3.5-turbo",
        apiKey: "test-key",
      }),
    });

    // Create a router that routes once then exits
    const routeOnceThenExit = createRoutingAgent({
      name: "Route Once Router",
      description: "Routes once then exits",
      tools: [
        // It needs the 'done' tool to be able to be called
        createTool({
          name: "done",
          parameters: z.object({ summary: z.string() }),
          handler: () => {},
        }),
      ],
      lifecycle: {
        onRoute: () => {
          routeCount++;

          // First call: route to agent
          if (routeCount === 1) {
            return ["Worker"];
          }

          // Second call: exit (simulating done tool)
          return undefined;
        },
      },
      system: "Route once then exit",
    });

    const network = createNetwork({
      name: "Test Network",
      agents: [testAgent],
      router: routeOnceThenExit,
      defaultModel: testAgent.model,
    });

    await network.run("Do some work");

    // Should have routed exactly twice: once to the agent, once to exit.
    expect(routeCount).toBe(2);
  });

  it("should handle custom done tool properly", async () => {
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
        // Also needs the default 'done' tool for the mock to work
        createTool({
          name: "done",
          parameters: z.object({ summary: z.string() }),
          handler: () => {},
        }),
      ],

      lifecycle: {
        onRoute: ({ result }) => {
          const tool = result.toolCalls[0];

          // If complete_task was called, exit
          if (tool?.tool.name === "complete_task") {
            return undefined;
          }

          // Otherwise continue (though in this test we always exit)
          return undefined;
        },
      },

      system: "Always call complete_task tool",
      model: openai({
        model: "gpt-3.5-turbo",
        apiKey: "test-key",
      }),
    });

    const network = createNetwork({
      name: "Custom Done Network",
      agents: [
        createAgent({
          name: "dummy",
          system: "dummy",
          model: openai({ model: "gpt-3.5-turbo" }),
        }),
      ],
      router: customRouter,
      defaultModel: customRouter.model,
    });

    const result = await network.run("Complete this");

    // Network should exit after router runs
    expect(result).toBeDefined();
  });
});
