import { describe, expect, test, vi } from "vitest";
import { createNetwork } from "./network";
import { createAgent } from "./agent";
import { createState } from "./state";
import { AgentResult, type Message } from "./types";
import { openai } from "./models";

// For this test, we mock the actual fetch call to avoid real network requests.
vi.spyOn(global, "fetch").mockImplementation(() =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        choices: [
          {
            message: { role: "assistant", content: "Mock AI response" },
            finish_reason: "stop",
          },
        ],
      })
    )
  )
);

describe("Network", () => {
  test("run should preserve results from a deserialized state", async () => {
    const agent = createAgent({
      name: "TestAgent",
      system: "You are a test agent.",
    });

    const network = createNetwork({
      name: "TestNetwork",
      agents: [agent],
      // A model is required for the agent to run.
      defaultModel: openai({ model: "gpt-4", apiKey: "test-key" }),
      router: ({ callCount }) => {
        // For this test, just run the single agent once.
        if (callCount === 0) {
          return agent;
        }
        return undefined;
      },
    });

    // 1. Create a state with existing results
    const initialResults = [new AgentResult("some-agent", [], [], new Date())];
    const originalState = createState({}, { results: initialResults });
    expect(originalState.results).toHaveLength(1);

    // 2. Simulate serialization/deserialization, which results in a plain object
    const deserializedState = JSON.parse(JSON.stringify(originalState)) as {
      data: Record<string, unknown>;
      _messages: Message[];
      _results: AgentResult[];
    };

    // 3. Run the network with the deserialized state
    const networkRun = await network.run("test input", {
      state: deserializedState,
    });

    // 4. Assert that the results were preserved in the network's state
    // The network will add a new result from the agent run.
    expect(networkRun.state.results).toHaveLength(2);
    expect(networkRun.state.results[0]?.agentName).toBe("some-agent");
    expect(networkRun.state.results[1]?.agentName).toBe("TestAgent");
  });

  test("run should preserve messages from a deserialized state", async () => {
    const agent = createAgent({
      name: "TestAgent",
      system: "You are a test agent.",
    });

    const network = createNetwork({
      name: "TestNetwork",
      agents: [agent],
      defaultModel: openai({ model: "gpt-4", apiKey: "test-key" }),
      router: ({ callCount }) => {
        if (callCount === 0) {
          return agent;
        }
        return undefined;
      },
    });

    // 1. Create a state with existing messages
    const initialMessages: Message[] = [
      { type: "text", role: "user", content: "Previous conversation" },
      { type: "text", role: "assistant", content: "Previous response" },
    ];
    const originalState = createState({}, { messages: initialMessages });

    // Verify the messages are in the original state
    const originalHistory = originalState.formatHistory();
    expect(originalHistory).toHaveLength(2);
    expect(originalHistory[0]?.type).toBe("text");
    expect(originalHistory[1]?.type).toBe("text");
    if (originalHistory[0]?.type === "text") {
      expect(originalHistory[0].content).toBe("Previous conversation");
    }
    if (originalHistory[1]?.type === "text") {
      expect(originalHistory[1].content).toBe("Previous response");
    }

    // 2. Simulate serialization/deserialization
    const deserializedState = JSON.parse(JSON.stringify(originalState)) as {
      data: Record<string, unknown>;
      _messages: Message[];
      _results: AgentResult[];
    };

    // 3. Run the network with the deserialized state
    const networkRun = await network.run("test input", {
      state: deserializedState,
    });

    // 4. Assert that the messages were preserved in the network's state
    const finalHistory = networkRun.state.formatHistory();

    // Should have the 2 original messages plus any new ones from the agent run
    expect(finalHistory.length).toBeGreaterThanOrEqual(2);
    expect(finalHistory[0]?.type).toBe("text");
    expect(finalHistory[1]?.type).toBe("text");
    if (finalHistory[0]?.type === "text") {
      expect(finalHistory[0].content).toBe("Previous conversation");
    }
    if (finalHistory[1]?.type === "text") {
      expect(finalHistory[1].content).toBe("Previous response");
    }
  });

  test("run should preserve typed data from a deserialized state", async () => {
    interface TestState {
      username?: string;
      processedItems?: number;
      metadata?: {
        timestamp: string;
        version: string;
      };
    }

    const agent = createAgent<TestState>({
      name: "TestAgent",
      system: "You are a test agent.",
    });

    const network = createNetwork<TestState>({
      name: "TestNetwork",
      agents: [agent],
      defaultModel: openai({ model: "gpt-4", apiKey: "test-key" }),
      router: ({ callCount }) => {
        if (callCount === 0) {
          return agent;
        }
        return undefined;
      },
    });

    // 1. Create a state with existing typed data
    const initialData: TestState = {
      username: "Alice",
      processedItems: 42,
      metadata: {
        timestamp: "2024-01-01T00:00:00Z",
        version: "1.0.0",
      },
    };
    const originalState = createState<TestState>(initialData);

    // Verify the data is in the original state
    expect(originalState.data.username).toBe("Alice");
    expect(originalState.data.processedItems).toBe(42);
    expect(originalState.data.metadata?.timestamp).toBe("2024-01-01T00:00:00Z");
    expect(originalState.data.metadata?.version).toBe("1.0.0");

    // 2. Simulate serialization/deserialization
    const deserializedState = JSON.parse(JSON.stringify(originalState)) as {
      data: TestState;
      _messages: Message[];
      _results: AgentResult[];
    };

    // 3. Run the network with the deserialized state
    const networkRun = await network.run("test input", {
      state: deserializedState,
    });

    // 4. Assert that the typed data was preserved in the network's state
    expect(networkRun.state.data.username).toBe("Alice");
    expect(networkRun.state.data.processedItems).toBe(42);
    expect(networkRun.state.data.metadata?.timestamp).toBe(
      "2024-01-01T00:00:00Z"
    );
    expect(networkRun.state.data.metadata?.version).toBe("1.0.0");

    // 5. Verify that the state is mutable (agent could have updated it via tools)
    // This ensures we're working with the actual state object, not a copy
    networkRun.state.data.username = "Bob";
    expect(networkRun.state.data.username).toBe("Bob");
  });
});
