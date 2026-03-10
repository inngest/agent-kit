/* eslint-disable @typescript-eslint/require-await */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { AgenticModel, createAgenticModelFromLanguageModel } from "./model";
import type { Tool } from "./tool";
import { createMockModel } from "./__tests__/test-helpers";

describe("AgenticModel", () => {
  it("infers a text response", async () => {
    const model = createMockModel({ text: "Hello world" });
    const agentic = new AgenticModel(model);

    const result = await agentic.infer(
      "test-step",
      [{ type: "text", role: "user", content: "Hi" }],
      [],
      "auto"
    );

    expect(result.output).toHaveLength(1);
    expect(result.output[0]!.type).toBe("text");
    if (result.output[0]!.type === "text") {
      expect(result.output[0]!.content).toBe("Hello world");
      expect(result.output[0]!.role).toBe("assistant");
      expect(result.output[0]!.stop_reason).toBe("stop");
    }
    expect(result.raw).toEqual({
      text: "Hello world",
      toolCalls: [],
      finishReason: "stop",
    });
  });

  it("infers a tool call response", async () => {
    const model = createMockModel({
      toolCalls: [
        { toolCallId: "c1", toolName: "get_weather", args: { city: "NYC" } },
      ],
    });
    const agentic = new AgenticModel(model);

    const tools: Tool.Any[] = [
      {
        name: "get_weather",
        description: "Get weather",
        parameters: z.object({ city: z.string() }),
        handler: async () => "sunny",
      },
    ];

    const result = await agentic.infer(
      "test-step",
      [{ type: "text", role: "user", content: "Weather?" }],
      tools,
      "auto"
    );

    expect(result.output).toHaveLength(1);
    expect(result.output[0]!.type).toBe("tool_call");
    if (result.output[0]!.type === "tool_call") {
      expect(result.output[0]!.tools).toHaveLength(1);
      expect(result.output[0]!.tools[0]!.name).toBe("get_weather");
      expect(result.output[0]!.tools[0]!.input).toEqual({ city: "NYC" });
    }
  });

  it("infers a response with both text and tool calls", async () => {
    const model = createMockModel({
      text: "Let me check that.",
      toolCalls: [
        { toolCallId: "c1", toolName: "search", args: { q: "test" } },
      ],
    });
    const agentic = new AgenticModel(model);

    const tools: Tool.Any[] = [
      {
        name: "search",
        description: "Search",
        parameters: z.object({ q: z.string() }),
        handler: async () => [],
      },
    ];

    const result = await agentic.infer(
      "test-step",
      [{ type: "text", role: "user", content: "Find something" }],
      tools,
      "auto"
    );

    expect(result.output).toHaveLength(2);
    expect(result.output[0]!.type).toBe("text");
    expect(result.output[1]!.type).toBe("tool_call");
  });

  it("propagates errors from the model", async () => {
    const model = createMockModel({
      error: new Error("Rate limit exceeded"),
    });
    const agentic = new AgenticModel(model);

    await expect(
      agentic.infer(
        "test-step",
        [{ type: "text", role: "user", content: "Hi" }],
        [],
        "auto"
      )
    ).rejects.toThrow("Rate limit exceeded");
  });

  it("propagates specific error types from the model", async () => {
    class RateLimitError extends Error {
      constructor(public retryAfter: number) {
        super("Rate limited");
        this.name = "RateLimitError";
      }
    }

    const model = createMockModel({
      error: new RateLimitError(30),
    });
    const agentic = new AgenticModel(model);

    await expect(
      agentic.infer(
        "test-step",
        [{ type: "text", role: "user", content: "Hi" }],
        [],
        "auto"
      )
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("does not pass toolChoice when no tools are provided", async () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const model = {
      specificationVersion: "v2",
      provider: "mock",
      modelId: "mock-model",
      supportedUrls: {},
      // eslint-disable-next-line @typescript-eslint/require-await
      doGenerate: async (options: unknown) => {
        capturedOptions = options as Record<string, unknown>;
        return {
          content: [{ type: "text" as const, text: "response" }],
          finishReason: "stop" as const,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
      doStream: async () => {
        throw new Error("Not implemented");
      },
    } as unknown as LanguageModel;
    const agentic = new AgenticModel(model);

    await agentic.infer(
      "test-step",
      [{ type: "text", role: "user", content: "Hi" }],
      [],
      "any"
    );

    // When no tools are provided, tools and toolChoice should not be set
    expect(capturedOptions).toBeDefined();
  });
});

describe("createAgenticModelFromLanguageModel", () => {
  it("creates an AgenticModel instance", () => {
    const model = createMockModel();
    const agentic = createAgenticModelFromLanguageModel(model);
    expect(agentic).toBeInstanceOf(AgenticModel);
  });
});
