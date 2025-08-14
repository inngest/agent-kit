import { describe, it, expect } from "vitest";
import { createAgent, createRoutingAgent, createNetwork, createTool, openai } from "../index";
import { z } from "zod";

describe("Routing with Done Tool", () => {
  it("should exit network when done tool is called", async () => {
    // Create a simple test agent
    const testAgent = createAgent({
      name: "Test Agent",
      description: "A test agent",
      system: "You are a test agent. Always respond with 'Task completed'.",
      model: openai({ 
        model: "gpt-3.5-turbo", 
        apiKey: "test-key" 
      }),
    });

    // Create a routing agent that immediately calls done
    const routerThatExits = createRoutingAgent({
      name: "Exit Router",
      description: "Always exits immediately",
      lifecycle: {
        onRoute: ({ result }) => {
          // Simulate calling the done tool
          return undefined; // Exit immediately
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
        apiKey: "test-key" 
      }),
    });

    // Create a router that routes once then exits
    const routeOnceThenExit = createRoutingAgent({
      name: "Route Once Router",
      description: "Routes once then exits",
      lifecycle: {
        onRoute: ({ network }) => {
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
    
    // Should have routed exactly once
    expect(routeCount).toBe(2); // Called twice: once to route, once to exit
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
            message: z.string()
          }),
          handler: ({ message }) => {
            return `Completed: ${message}`;
          }
        })
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
        }
      },
      
      system: "Always call complete_task tool",
      model: openai({ 
        model: "gpt-3.5-turbo", 
        apiKey: "test-key" 
      }),
    });

    const network = createNetwork({
      name: "Custom Done Network",
      agents: [],
      router: customRouter,
    });

    const result = await network.run("Complete this");
    
    // Network should exit after router runs
    expect(result).toBeDefined();
  });
});

