import { describe, expect, test } from "vitest";
import { createNetwork } from "./network";
import { createAgent } from "./agent";
import { createState } from "./state";
import { AgentResult, type Message } from "./types";
import { createMockModel } from "./__tests__/test-helpers";

describe("Network", () => {
  test("run should preserve results from a deserialized state", async () => {
    const mockModel = createMockModel();

    const agent = createAgent({
      name: "TestAgent",
      system: "You are a test agent.",
    });

    const network = createNetwork({
      name: "TestNetwork",
      agents: [agent],
      defaultModel: mockModel,
      router: ({ callCount }) => {
        if (callCount === 0) {
          return agent;
        }
        return undefined;
      },
    });

    const initialResults = [new AgentResult("some-agent", [], [], new Date())];
    const originalState = createState({}, { results: initialResults });
    expect(originalState.results).toHaveLength(1);

    const deserializedState = JSON.parse(JSON.stringify(originalState)) as {
      data: Record<string, unknown>;
      _messages: Message[];
      _results: AgentResult[];
    };

    const networkRun = await network.run("test input", {
      state: deserializedState,
    });

    expect(networkRun.state.results).toHaveLength(2);
    expect(networkRun.state.results[0]?.agentName).toBe("some-agent");
    expect(networkRun.state.results[1]?.agentName).toBe("TestAgent");
  });

  test("run should preserve messages from a deserialized state", async () => {
    const mockModel = createMockModel();

    const agent = createAgent({
      name: "TestAgent",
      system: "You are a test agent.",
    });

    const network = createNetwork({
      name: "TestNetwork",
      agents: [agent],
      defaultModel: mockModel,
      router: ({ callCount }) => {
        if (callCount === 0) {
          return agent;
        }
        return undefined;
      },
    });

    const initialMessages: Message[] = [
      { type: "text", role: "user", content: "Previous conversation" },
      { type: "text", role: "assistant", content: "Previous response" },
    ];
    const originalState = createState({}, { messages: initialMessages });

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

    const deserializedState = JSON.parse(JSON.stringify(originalState)) as {
      data: Record<string, unknown>;
      _messages: Message[];
      _results: AgentResult[];
    };

    const networkRun = await network.run("test input", {
      state: deserializedState,
    });

    const finalHistory = networkRun.state.formatHistory();

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
    const mockModel = createMockModel();

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
      defaultModel: mockModel,
      router: ({ callCount }) => {
        if (callCount === 0) {
          return agent;
        }
        return undefined;
      },
    });

    const initialData: TestState = {
      username: "Alice",
      processedItems: 42,
      metadata: {
        timestamp: "2024-01-01T00:00:00Z",
        version: "1.0.0",
      },
    };
    const originalState = createState<TestState>(initialData);

    expect(originalState.data.username).toBe("Alice");
    expect(originalState.data.processedItems).toBe(42);
    expect(originalState.data.metadata?.timestamp).toBe("2024-01-01T00:00:00Z");
    expect(originalState.data.metadata?.version).toBe("1.0.0");

    const deserializedState = JSON.parse(JSON.stringify(originalState)) as {
      data: TestState;
      _messages: Message[];
      _results: AgentResult[];
    };

    const networkRun = await network.run("test input", {
      state: deserializedState,
    });

    expect(networkRun.state.data.username).toBe("Alice");
    expect(networkRun.state.data.processedItems).toBe(42);
    expect(networkRun.state.data.metadata?.timestamp).toBe(
      "2024-01-01T00:00:00Z"
    );
    expect(networkRun.state.data.metadata?.version).toBe("1.0.0");

    networkRun.state.data.username = "Bob";
    expect(networkRun.state.data.username).toBe("Bob");
  });
});
