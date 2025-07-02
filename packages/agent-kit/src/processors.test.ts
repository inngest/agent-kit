import { describe, expect, test, it } from "vitest";
import {
  ToolCallFilter,
  TokenLimiter,
  applyProcessors,
  type TokenizerEncoding,
  type Tokenizer,
  ApproximateTokenizer,
  TokenizerFactory,
  HistoryProcessor,
} from "./processors";
import type {
  Message,
  ToolCallMessage,
  ToolResultMessage,
  TextMessage,
} from "./types";

// Helper function to create test messages
const createTextMessage = (
  role: "system" | "user" | "assistant",
  content: string
): Message => ({
  type: "text",
  role,
  content,
  stop_reason: "stop",
});

const createToolCallMessage = (
  tools: Array<{ name: string; id: string; input: Record<string, unknown> }>
): ToolCallMessage => ({
  type: "tool_call",
  role: "assistant",
  tools: tools.map((tool) => ({
    type: "tool",
    id: tool.id,
    name: tool.name,
    function: tool.name, // Added to match OpenAI adapter output
    input: { arguments: tool.input }, // Wrapped in arguments to match expected structure
  })),
  stop_reason: "tool",
});

const createToolResultMessage = (
  toolName: string,
  toolId: string,
  content: unknown
): ToolResultMessage => ({
  type: "tool_result",
  role: "tool_result",
  tool: {
    type: "tool",
    id: toolId,
    name: toolName,
    input: {},
  },
  content,
  stop_reason: "tool",
});

describe("ToolCallFilter", () => {
  const sampleMessages: Message[] = [
    createTextMessage("system", "You are a helpful assistant"),
    createTextMessage("user", "Search for documents about cats"),
    createToolCallMessage([
      { name: "semantic_search", id: "call_1", input: { query: "cats" } },
    ]),
    createToolResultMessage("semantic_search", "call_1", {
      documents: ["doc1", "doc2"],
    }),
    createTextMessage("assistant", "I found some documents about cats"),
    createToolCallMessage([
      { name: "generate_image", id: "call_2", input: { prompt: "cute cat" } },
    ]),
    createToolResultMessage("generate_image", "call_2", {
      image_url: "https://example.com/cat.jpg",
    }),
    createTextMessage("assistant", "Here's a cute cat image!"),
  ];

  describe("exclude all tools (default behavior)", () => {
    test("should remove all tool calls and results", () => {
      const filter = new ToolCallFilter();
      const result = filter.process(sampleMessages);

      expect(result).toHaveLength(4); // Only text messages remain
      expect(result.every((msg) => msg.type === "text")).toBe(true);
      // Verify the content of text messages by checking each one individually
      const textMessages = result.filter((msg) => msg.type === "text");
      expect(textMessages).toHaveLength(4);
      expect(textMessages[0]!.content).toBe("You are a helpful assistant");
      expect(textMessages[1]!.content).toBe("Search for documents about cats");
      expect(textMessages[2]!.content).toBe(
        "I found some documents about cats"
      );
      expect(textMessages[3]!.content).toBe("Here's a cute cat image!");
    });

    test("should replace tool calls with summaries when persistResults=true", () => {
      const filter = new ToolCallFilter({ persistResults: true });
      const result = filter.process(sampleMessages);

      expect(result).toHaveLength(6); // Text messages + 2 summary messages

      // Check that tool calls are replaced with summaries
      const summaryMessages = result.filter(
        (msg) =>
          msg.type === "text" &&
          msg.role === "assistant" &&
          typeof msg.content === "string" &&
          msg.content.includes("Used **")
      );
      expect(summaryMessages).toHaveLength(2);
      expect((summaryMessages[0] as TextMessage).content).toBe(
        "Used **semantic_search** tool"
      );
      expect((summaryMessages[1] as TextMessage).content).toBe(
        "Used **generate_image** tool"
      );
    });
  });

  describe("exclude specific tools", () => {
    test("should exclude only specified tools", () => {
      const filter = new ToolCallFilter({ exclude: ["semantic_search"] });
      const result = filter.process(sampleMessages);

      // Should keep generate_image tool but exclude semantic_search
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      expect(toolCallMessages).toHaveLength(1);
      expect((toolCallMessages[0] as ToolCallMessage).tools[0]!.name).toBe(
        "generate_image"
      );

      const toolResultMessages = result.filter(
        (msg) => msg.type === "tool_result"
      );
      expect(toolResultMessages).toHaveLength(1);
      expect((toolResultMessages[0] as ToolResultMessage).tool.name).toBe(
        "generate_image"
      );
    });

    test("should replace excluded tools with summaries when persistResults=true", () => {
      const filter = new ToolCallFilter({
        exclude: ["semantic_search"],
        persistResults: true,
      });
      const result = filter.process(sampleMessages);

      const summaryMessages = result.filter(
        (msg) =>
          msg.type === "text" &&
          msg.role === "assistant" &&
          typeof msg.content === "string" &&
          msg.content.includes("Used **semantic_search**")
      );
      expect(summaryMessages).toHaveLength(1);

      // Should still have generate_image tool call
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      expect(toolCallMessages).toHaveLength(1);
    });
  });

  describe("include specific tools", () => {
    test("should include only specified tools", () => {
      const filter = new ToolCallFilter({ include: ["generate_image"] });
      const result = filter.process(sampleMessages);

      // Should keep only generate_image tool
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      expect(toolCallMessages).toHaveLength(1);
      expect((toolCallMessages[0] as ToolCallMessage).tools[0]!.name).toBe(
        "generate_image"
      );

      const toolResultMessages = result.filter(
        (msg) => msg.type === "tool_result"
      );
      expect(toolResultMessages).toHaveLength(1);
      expect((toolResultMessages[0] as ToolResultMessage).tool.name).toBe(
        "generate_image"
      );
    });

    test("should replace excluded tools with summaries when persistResults=true", () => {
      const filter = new ToolCallFilter({
        include: ["generate_image"],
        persistResults: true,
      });
      const result = filter.process(sampleMessages);

      // Should have summary for excluded semantic_search
      const summaryMessages = result.filter(
        (msg) =>
          msg.type === "text" &&
          msg.role === "assistant" &&
          typeof msg.content === "string" &&
          msg.content.includes("Used **semantic_search**")
      );
      expect(summaryMessages).toHaveLength(1);

      // Should still have generate_image tool call
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      expect(toolCallMessages).toHaveLength(1);
      expect((toolCallMessages[0] as ToolCallMessage).tools[0]!.name).toBe(
        "generate_image"
      );
    });
  });

  describe("multiple tools in single message", () => {
    test("should handle multiple tools in a single tool_call message", () => {
      const multiToolMessage = createToolCallMessage([
        { name: "semantic_search", id: "call_1", input: { query: "cats" } },
        { name: "generate_image", id: "call_2", input: { prompt: "cat" } },
      ]);

      const messages = [multiToolMessage];
      const filter = new ToolCallFilter({ include: ["generate_image"] });
      const result = filter.process(messages);

      expect(result).toHaveLength(1);
      const toolCallMsg = result[0] as ToolCallMessage;
      expect(toolCallMsg.tools).toHaveLength(1);
      expect(toolCallMsg.tools[0]!.name).toBe("generate_image");
    });

    test("should create summary for multiple excluded tools", () => {
      const multiToolMessage = createToolCallMessage([
        { name: "semantic_search", id: "call_1", input: { query: "cats" } },
        { name: "web_search", id: "call_2", input: { query: "dogs" } },
      ]);

      const messages = [multiToolMessage];
      const filter = new ToolCallFilter({
        exclude: ["semantic_search", "web_search"],
        persistResults: true,
      });
      const result = filter.process(messages);

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("text");
      expect((result[0] as TextMessage).content).toBe(
        "Used tools: semantic_search, web_search"
      );
    });
  });

  describe("edge cases", () => {
    test("should handle empty message array", () => {
      const filter = new ToolCallFilter();
      const result = filter.process([]);
      expect(result).toEqual([]);
    });

    test("should handle messages with no tool calls", () => {
      const textOnlyMessages = [
        createTextMessage("system", "You are helpful"),
        createTextMessage("user", "Hello"),
        createTextMessage("assistant", "Hi there!"),
      ];

      const filter = new ToolCallFilter();
      const result = filter.process(textOnlyMessages);
      expect(result).toEqual(textOnlyMessages);
    });

    test("should handle tool calls with no matching results", () => {
      const messages = [
        createToolCallMessage([{ name: "test_tool", id: "call_1", input: {} }]),
      ];

      const filter = new ToolCallFilter();
      const result = filter.process(messages);
      expect(result).toEqual([]);
    });

    test("should maintain tool_call/tool_result pairing when filtering", () => {
      const messages = [
        createTextMessage("system", "System prompt"),
        createToolCallMessage([
          { name: "semantic_search", id: "call_1", input: { query: "test" } },
          { name: "generate_image", id: "call_2", input: { prompt: "cat" } },
        ]),
        createToolResultMessage("semantic_search", "call_1", {
          docs: ["doc1"],
        }),
        createToolResultMessage("generate_image", "call_2", {
          url: "image.jpg",
        }),
        createTextMessage("assistant", "Done with both tools"),
      ];

      // Filter to only keep generate_image
      const filter = new ToolCallFilter({ include: ["generate_image"] });
      const result = filter.process(messages);

      // Should have tool call and result for generate_image only
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      const toolResultMessages = result.filter(
        (msg) => msg.type === "tool_result"
      );

      expect(toolCallMessages).toHaveLength(1);
      expect(toolResultMessages).toHaveLength(1);

      const toolCallMsg = toolCallMessages[0] as ToolCallMessage;
      const toolResultMsg = toolResultMessages[0] as ToolResultMessage;

      expect(toolCallMsg.tools[0]!.name).toBe("generate_image");
      expect(toolResultMsg.tool.name).toBe("generate_image");
      expect(toolResultMsg.tool.id).toBe(toolCallMsg.tools[0]!.id);
    });

    test("should not create orphaned tool results", () => {
      const messages = [
        createTextMessage("system", "System prompt"),
        createToolCallMessage([
          { name: "semantic_search", id: "call_1", input: {} },
        ]),
        createToolResultMessage("semantic_search", "call_1", "search results"),
        createTextMessage("assistant", "Found results"),
      ];

      // Exclude semantic_search - should remove both call and result
      const filter = new ToolCallFilter({ exclude: ["semantic_search"] });
      const result = filter.process(messages);

      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      const toolResultMessages = result.filter(
        (msg) => msg.type === "tool_result"
      );

      expect(toolCallMessages).toHaveLength(0);
      expect(toolResultMessages).toHaveLength(0);

      // Should only have text messages
      expect(result.every((msg) => msg.type === "text")).toBe(true);
    });
  });
});

describe("TokenLimiter", () => {
  const longMessage = createTextMessage("user", "A".repeat(1000)); // ~250 tokens
  const shortMessage = createTextMessage("assistant", "Short response"); // ~3 tokens
  const mediumMessage = createTextMessage("user", "B".repeat(200)); // ~50 tokens

  test("should keep all messages when under limit", () => {
    const limiter = new TokenLimiter(1000);
    const messages = [shortMessage, mediumMessage];
    const result = limiter.process(messages);

    expect(result).toEqual(messages);
  });

  test("should remove oldest messages when over limit", () => {
    const limiter = new TokenLimiter(100); // Allow ~100 tokens
    const messages = [longMessage, shortMessage, mediumMessage]; // ~303 tokens total
    const result = limiter.process(messages);

    // Should keep only the newest messages that fit within limit
    expect(result.length).toBeLessThan(messages.length);
    expect(result).toContain(mediumMessage); // Newest message should be kept
    expect(result).not.toContain(longMessage); // Oldest long message should be removed
  });

  test("should handle single message over limit", () => {
    const limiter = new TokenLimiter(10); // Very small limit
    const messages = [longMessage];
    const result = limiter.process(messages);

    // Should return empty array if even single message exceeds limit
    expect(result).toEqual([]);
  });

  test("should preserve message order", () => {
    const limiter = new TokenLimiter(200);
    const messages = [shortMessage, mediumMessage, shortMessage];
    const result = limiter.process(messages);

    // Should maintain the relative order of kept messages (newest messages first in processing, but original order preserved)
    expect(result).toHaveLength(3); // All messages should fit within 200 tokens
    expect(result[0]).toEqual(shortMessage); // First message in original order
    expect(result[1]).toEqual(mediumMessage); // Second message in original order
    expect(result[2]).toEqual(shortMessage); // Third message in original order
  });

  test("should handle empty message array", () => {
    const limiter = new TokenLimiter(100);
    const result = limiter.process([]);
    expect(result).toEqual([]);
  });

  test("should work with different constructor options", () => {
    const limiter1 = new TokenLimiter(100);
    const limiter2 = new TokenLimiter({ limit: 100, encoding: "cl100k_base" });

    expect(limiter1.name).toBe("TokenLimiter");
    expect(limiter2.name).toBe("TokenLimiter");
  });

  describe("token counting for different message types", () => {
    test("should count tokens in tool call messages", () => {
      const toolCallMsg = createToolCallMessage([
        { name: "test_tool", id: "call_1", input: { query: "A".repeat(100) } },
      ]);

      const limiter = new TokenLimiter(10); // Very small limit
      const result = limiter.process([toolCallMsg]);

      // Tool call message should be counted and potentially excluded
      expect(result.length).toBeLessThanOrEqual(1);
    });

    test("should count tokens in tool result messages", () => {
      const toolResultMsg = createToolResultMessage(
        "test_tool",
        "call_1",
        "A".repeat(100)
      );

      const limiter = new TokenLimiter(10); // Very small limit
      const result = limiter.process([toolResultMsg]);

      // Tool result message should be counted and potentially excluded
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  describe("tool call/result pairing preservation", () => {
    test("should keep tool_call and tool_result pairs together", () => {
      const messages = [
        createTextMessage("system", "You are helpful"),
        createTextMessage("user", "Use a tool"),
        createToolCallMessage([{ name: "test_tool", id: "call_1", input: {} }]),
        createToolResultMessage("test_tool", "call_1", "result"),
        createTextMessage("assistant", "Done"),
        createTextMessage("user", "A".repeat(1000)), // Large message to trigger truncation
      ];

      // Set limit to exclude the large message but should keep the tool pair
      const limiter = new TokenLimiter(100);
      const result = limiter.process(messages);

      // Should include tool call and result together, or exclude them together
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      const toolResultMessages = result.filter(
        (msg) => msg.type === "tool_result"
      );

      if (toolCallMessages.length > 0) {
        // If we have tool calls, we must have their results
        expect(toolResultMessages).toHaveLength(toolCallMessages.length);
        const toolCallMsg = toolCallMessages[0] as ToolCallMessage;
        const toolResultMsg = toolResultMessages[0] as ToolResultMessage;
        expect(toolResultMsg.tool.id).toBe(toolCallMsg.tools[0]!.id);
      } else {
        // If we don't have tool calls, we shouldn't have orphaned results
        expect(toolResultMessages).toHaveLength(0);
      }
    });

    test("should handle multiple tool call/result pairs", () => {
      const messages = [
        createTextMessage("system", "System prompt"),
        createToolCallMessage([
          { name: "tool1", id: "call_1", input: {} },
          { name: "tool2", id: "call_2", input: {} },
        ]),
        createToolResultMessage("tool1", "call_1", "result1"),
        createToolResultMessage("tool2", "call_2", "result2"),
        createTextMessage("assistant", "Both tools completed"),
        createTextMessage("user", "A".repeat(2000)), // Very large message
      ];

      const limiter = new TokenLimiter(150);
      const result = limiter.process(messages);

      // Check that tool calls and results are properly paired
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      const toolResultMessages = result.filter(
        (msg) => msg.type === "tool_result"
      );

      if (toolCallMessages.length > 0) {
        const toolCallMsg = toolCallMessages[0] as ToolCallMessage;
        const toolIds = new Set(toolCallMsg.tools.map((t) => t.id));

        // All tool results should correspond to tool calls
        for (const resultMsg of toolResultMessages) {
          expect(toolIds.has(resultMsg.tool.id)).toBe(true);
        }

        // Should have result for each tool call
        expect(toolResultMessages).toHaveLength(toolCallMsg.tools.length);
      }
    });

    test("should handle orphaned tool_result at start of messages", () => {
      // This could happen if we're loading partial history
      const messages = [
        createToolResultMessage("orphaned_tool", "call_0", "orphaned result"),
        createTextMessage("system", "System prompt"),
        createTextMessage("user", "Hello"),
        createToolCallMessage([{ name: "test_tool", id: "call_1", input: {} }]),
        createToolResultMessage("test_tool", "call_1", "result"),
        createTextMessage("assistant", "Done"),
      ];

      const limiter = new TokenLimiter(1000); // High limit to keep everything
      const result = limiter.process(messages);

      // Should keep all messages since we have enough tokens
      expect(result).toHaveLength(messages.length);
    });

    test("should handle incomplete tool sequences at end", () => {
      const messages = [
        createTextMessage("system", "System prompt"),
        createTextMessage("user", "Use a tool"),
        createToolCallMessage([{ name: "test_tool", id: "call_1", input: {} }]),
        // Missing tool result - this could happen if we're in the middle of execution
      ];

      const limiter = new TokenLimiter(50);
      const result = limiter.process(messages);

      // Should either keep the whole incomplete sequence or drop it entirely
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      const toolResultMessages = result.filter(
        (msg) => msg.type === "tool_result"
      );

      if (toolCallMessages.length > 0) {
        // If we kept the tool call, we should be prepared for the fact that
        // the result might be missing (incomplete sequence)
        expect(toolResultMessages).toHaveLength(0);
      }
    });
  });
});

describe("applyProcessors", () => {
  test("should apply processors in sequence", async () => {
    const messages = [
      createTextMessage("system", "You are helpful"),
      createToolCallMessage([
        { name: "semantic_search", id: "call_1", input: {} },
      ]),
      createToolResultMessage("semantic_search", "call_1", "result"),
      createTextMessage("user", "A".repeat(1000)), // Long message
      createTextMessage("assistant", "Short"),
    ];

    // First filter out tool calls, then limit tokens
    const processors = [
      new ToolCallFilter({ exclude: ["semantic_search"] }),
      new TokenLimiter(100),
    ];

    const result = await applyProcessors(messages, processors);

    // Should have no tool calls (filtered out) and be under token limit
    expect(result.every((msg) => msg.type === "text")).toBe(true);
    expect(result.length).toBeLessThan(messages.length);
  });

  test("should handle empty processor array", async () => {
    const messages = [createTextMessage("user", "Hello")];
    const result = await applyProcessors(messages, []);
    expect(result).toEqual(messages);
  });

  test("should handle empty message array", async () => {
    const processors = [new ToolCallFilter()];
    const result = await applyProcessors([], processors);
    expect(result).toEqual([]);
  });

  test("should maintain processor order", async () => {
    const messages = [
      createToolCallMessage([{ name: "test_tool", id: "call_1", input: {} }]),
      createToolResultMessage("test_tool", "call_1", "result"),
      createTextMessage("assistant", "Done"),
    ];

    // Apply token limiter first (should keep all), then filter (should remove tools)
    const processors1 = [new TokenLimiter(1000), new ToolCallFilter()];

    // Apply filter first (should remove tools), then token limiter
    const processors2 = [new ToolCallFilter(), new TokenLimiter(1000)];

    const result1 = await applyProcessors(messages, processors1);
    const result2 = await applyProcessors(messages, processors2);

    // Both should end up with same result (only text message)
    expect(result1).toEqual(result2);
    expect(result1).toHaveLength(1);
    expect(result1[0]!.type).toBe("text");
  });
});

describe("processor integration scenarios", () => {
  test("should handle complex multi-tool scenario", async () => {
    const messages = [
      createTextMessage("system", "You are helpful"),
      createTextMessage("user", "Find and generate content"),
      createToolCallMessage([
        { name: "semantic_search", id: "call_1", input: { query: "cats" } },
        { name: "web_search", id: "call_2", input: { query: "dogs" } },
      ]),
      createToolResultMessage("semantic_search", "call_1", { docs: ["doc1"] }),
      createToolResultMessage("web_search", "call_2", { results: ["result1"] }),
      createToolCallMessage([
        {
          name: "generate_image",
          id: "call_3",
          input: { prompt: "cute animal" },
        },
      ]),
      createToolResultMessage("generate_image", "call_3", { url: "image.jpg" }),
      createTextMessage("assistant", "Here's what I found and generated"),
    ];

    const processors = [
      new ToolCallFilter({
        include: ["generate_image"],
        persistResults: true,
      }),
      new TokenLimiter(500),
    ];

    const result = await applyProcessors(messages, processors);

    // Should have:
    // - Original text messages
    // - Summary for excluded tools
    // - generate_image tool call and result
    // - All within token limit

    const textMessages = result.filter((msg) => msg.type === "text");
    const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
    const toolResultMessages = result.filter(
      (msg) => msg.type === "tool_result"
    );

    expect(toolCallMessages).toHaveLength(1);
    expect((toolCallMessages[0] as ToolCallMessage).tools[0]!.name).toBe(
      "generate_image"
    );
    expect(toolResultMessages).toHaveLength(1);

    // Should have summary message for excluded tools
    const summaryMessage = textMessages.find(
      (msg) =>
        typeof msg.content === "string" && msg.content.includes("Used tools:")
    );
    expect(summaryMessage).toBeDefined();
  });
});

describe("Tokenizer system", () => {
  describe("TokenizerEncoding type safety", () => {
    it("should provide autocomplete for valid encodings", () => {
      // These should compile without TypeScript errors
      const validEncodings: TokenizerEncoding[] = [
        "o200k_base",
        "cl100k_base",
        "p50k_base",
        "r50k_base",
        "gpt2",
      ];

      validEncodings.forEach((encoding) => {
        expect(typeof encoding).toBe("string");
      });
    });
  });

  describe("ApproximateTokenizer", () => {
    it("should calculate different token counts for different encodings", () => {
      const text = "Hello world! This is a test message with some content.";

      const o200k = new ApproximateTokenizer("o200k_base");
      const cl100k = new ApproximateTokenizer("cl100k_base");
      const gpt2 = new ApproximateTokenizer("gpt2");

      const o200kCount = o200k.count(text);
      const cl100kCount = cl100k.count(text);
      const gpt2Count = gpt2.count(text);

      // GPT-2 should have higher token count (less efficient)
      expect(gpt2Count).toBeGreaterThan(cl100kCount);
      // o200k should have lower token count (more efficient)
      expect(o200kCount).toBeLessThan(cl100kCount);
    });

    it("should maintain encoding property", () => {
      const tokenizer = new ApproximateTokenizer("cl100k_base");
      expect(tokenizer.encoding).toBe("cl100k_base");
    });
  });

  describe("TokenizerFactory", () => {
    it("should create appropriate tokenizer based on availability", () => {
      const tokenizer = TokenizerFactory.create("o200k_base");
      expect(tokenizer.encoding).toBe("o200k_base");
      expect(typeof tokenizer.count).toBe("function");
    });

    it("should report tiktoken availability", () => {
      const hasTiktoken = TokenizerFactory.hasTiktoken;
      expect(typeof hasTiktoken).toBe("boolean");
    });

    it("should cache tiktoken instances", () => {
      const tokenizer1 = TokenizerFactory.create("cl100k_base");
      const tokenizer2 = TokenizerFactory.create("cl100k_base");

      // Should work consistently
      const text = "Test message";
      expect(tokenizer1.count(text)).toBe(tokenizer2.count(text));
    });
  });

  describe("TokenLimiter with different tokenizers", () => {
    it("should accept encoding parameter with type safety", () => {
      const processor1 = new TokenLimiter({
        limit: 100,
        encoding: "cl100k_base",
      });
      const processor2 = new TokenLimiter({
        limit: 100,
        encoding: "o200k_base",
      });

      expect(processor1.info.encoding).toBe("cl100k_base");
      expect(processor2.info.encoding).toBe("o200k_base");
    });

    it("should force approximation tokenizer when useTiktoken is false", () => {
      const processor = new TokenLimiter({
        limit: 100,
        encoding: "cl100k_base",
        useTiktoken: false,
      });

      expect(processor.info.type).toBe("ApproximateTokenizer");
      expect(processor.info.encoding).toBe("cl100k_base");
    });

    it("should accept custom tokenizer implementation", () => {
      const customTokenizer: Tokenizer = {
        encoding: "cl100k_base",
        count: () => 42, // Always return 42 tokens
      };

      const processor = new TokenLimiter({
        limit: 100,
        tokenizer: customTokenizer,
      });
      expect(processor.info.type).toBe("Object");

      const messages = [createTextMessage("user", "Any text")];
      const result = processor.process(messages);
      expect(result).toEqual(messages); // Should keep message since 42 < 100
    });

    it("should provide tokenizer information", () => {
      const processor = new TokenLimiter(1000);
      const info = processor.info;

      expect(info).toHaveProperty("encoding");
      expect(info).toHaveProperty("type");
      expect(info).toHaveProperty("hasTiktoken");
      expect(typeof info.hasTiktoken).toBe("boolean");
    });

    it("should handle different encodings consistently", () => {
      const messages = [
        createTextMessage("user", "This is a test message for tokenization"),
        createTextMessage("assistant", "Another message to add more content"),
        createTextMessage("user", "Final message for the test"),
      ];

      const processor1 = new TokenLimiter({
        limit: 50,
        encoding: "o200k_base",
        useTiktoken: false,
      });
      const processor2 = new TokenLimiter({
        limit: 50,
        encoding: "gpt2",
        useTiktoken: false,
      });

      const result1 = processor1.process(messages);
      const result2 = processor2.process(messages);

      // GPT-2 encoding should result in fewer messages kept (higher token count per message)
      expect(result2.length).toBeLessThanOrEqual(result1.length);
    });
  });

  describe("TokenLimiter constructor overloads", () => {
    it("should work with simple number parameter", () => {
      const processor = new TokenLimiter(5000);
      expect(processor.info.encoding).toBe("o200k_base"); // Default encoding
    });

    it("should work with options object", () => {
      const processor = new TokenLimiter({
        limit: 5000,
        encoding: "cl100k_base",
      });
      expect(processor.info.encoding).toBe("cl100k_base");
    });
  });

  describe("Real-world tokenizer scenarios", () => {
    it("should handle code content appropriately", () => {
      const codeMessage = createTextMessage(
        "user",
        `
        function fibonacci(n: number): number {
          if (n < 2) return n;
          return fibonacci(n - 1) + fibonacci(n - 2);
        }
      `
      );

      const p50kProcessor = new TokenLimiter({
        limit: 20,
        encoding: "p50k_base", // Code-focused encoding
        useTiktoken: false,
      });

      const cl100kProcessor = new TokenLimiter({
        limit: 20,
        encoding: "cl100k_base",
        useTiktoken: false,
      });

      const messages = [codeMessage];
      const p50kResult = p50kProcessor.process(messages);
      const cl100kResult = cl100kProcessor.process(messages);

      // Both should handle the same content
      expect(Array.isArray(p50kResult)).toBe(true);
      expect(Array.isArray(cl100kResult)).toBe(true);
    });

    it("should gracefully handle empty and edge case content", () => {
      const processor = new TokenLimiter({ limit: 100, useTiktoken: false });

      const edgeCases = [
        createTextMessage("user", ""), // Empty
        createTextMessage("user", "🚀🎉🌟"), // Emojis only
        createTextMessage("user", "   \n\t  "), // Whitespace only
        createTextMessage("user", "a"), // Single character
      ];

      const result = processor.process(edgeCases);
      expect(result.length).toBe(edgeCases.length); // All should fit in 100 tokens
    });
  });
});

describe("Processor Hierarchy Integration", () => {
  describe("HistoryConfig → Network → Agent processor order", () => {
    it("should apply processors in correct order: history → network → agent", async () => {
      // Track the order processors are applied
      const processingOrder: string[] = [];

      class OrderTracker extends HistoryProcessor {
        constructor(name: string) {
          super({ name });
        }

        process(messages: Message[]): Message[] {
          processingOrder.push(this.name);
          return messages;
        }
      }

      const historyProcessor = new OrderTracker("HistoryConfig");
      const networkProcessor = new OrderTracker("Network");
      const agentProcessor = new OrderTracker("Agent");

      const messages = [createTextMessage("user", "Test message")];

      // Simulate the processor application from agent.ts lines 229-238
      const allProcessors = [
        historyProcessor,
        networkProcessor,
        agentProcessor,
      ];
      await applyProcessors(messages, allProcessors);

      expect(processingOrder).toEqual(["HistoryConfig", "Network", "Agent"]);
    });

    it("should compose different processor types across levels", async () => {
      const messages = [
        createTextMessage("system", "System prompt"),
        createToolCallMessage([
          { name: "debug_tool", id: "call_1", input: { query: "test" } },
          { name: "search_tool", id: "call_2", input: { query: "test" } },
        ]),
        createToolResultMessage("debug_tool", "call_1", "debug result"),
        createToolResultMessage("search_tool", "call_2", "search result"),
        createTextMessage("assistant", "A".repeat(1000)), // Long message for token limiting
        createTextMessage("user", "Final message"),
      ];

      // History level: Remove debug tools (org-wide policy)
      const historyProcessors = [
        new ToolCallFilter({ exclude: ["debug_tool"] }),
      ];

      // Network level: Apply token limiting (product-specific)
      const networkProcessors = [
        new TokenLimiter({ limit: 100, useTiktoken: false }),
      ];

      // Agent level: Additional filtering (role-specific)
      const agentProcessors = [
        new ToolCallFilter({ exclude: ["admin_tool"] }), // No admin tools in this test, but shows the pattern
      ];

      // Apply in the same order as agent.ts
      const allProcessors = [
        ...historyProcessors,
        ...networkProcessors,
        ...agentProcessors,
      ];

      const result = await applyProcessors(messages, allProcessors);

      // Should have no debug tools (removed by history processor)
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      const toolResultMessages = result.filter(
        (msg) => msg.type === "tool_result"
      );

      expect(
        toolCallMessages.every(
          (msg) =>
            msg.type === "tool_call" &&
            !msg.tools.some((tool) => tool.name === "debug_tool")
        )
      ).toBe(true);

      expect(
        toolResultMessages.every(
          (msg) => msg.type === "tool_result" && msg.tool.name !== "debug_tool"
        )
      ).toBe(true);

      // Should be under token limit (applied by network processor)
      // Exact count depends on tokenizer, but should be reduced from original
      expect(result.length).toBeLessThan(messages.length);
    });

    it("should handle empty processor arrays at different levels", async () => {
      const messages = [createTextMessage("user", "Test message")];

      // Simulate some levels having no processors
      const allProcessors = [
        // No history processors
        ...([] as HistoryProcessor[]),
        // Network has processors
        new TokenLimiter(1000),
        // No agent processors
        ...([] as HistoryProcessor[]),
      ];

      const result = await applyProcessors(messages, allProcessors);
      expect(result).toEqual(messages); // Should pass through unchanged
    });

    it("should maintain processor state isolation between levels", async () => {
      // Create processors that track their own state
      class StatefulProcessor extends HistoryProcessor {
        public callCount = 0;

        constructor(name: string) {
          super({ name });
        }

        process(messages: Message[]): Message[] {
          this.callCount++;
          return messages;
        }
      }

      const historyProcessor = new StatefulProcessor("History");
      const networkProcessor = new StatefulProcessor("Network");
      const agentProcessor = new StatefulProcessor("Agent");

      const messages = [createTextMessage("user", "Test")];

      // Apply processors as agent.ts does
      const allProcessors = [
        historyProcessor,
        networkProcessor,
        agentProcessor,
      ];
      await applyProcessors(messages, allProcessors);

      // Each processor should have been called exactly once
      expect(historyProcessor.callCount).toBe(1);
      expect(networkProcessor.callCount).toBe(1);
      expect(agentProcessor.callCount).toBe(1);
    });
  });

  describe("Real-world processor hierarchy scenarios", () => {
    it("should handle multi-tenant filtering scenario", async () => {
      const messages = [
        createTextMessage("system", "You are a helpful assistant"),
        createTextMessage("user", "Help me with admin tasks"),
        createToolCallMessage([
          { name: "user_search", id: "call_1", input: { query: "users" } },
          { name: "admin_delete", id: "call_2", input: { userId: "123" } },
          { name: "debug_log", id: "call_3", input: { message: "debug info" } },
        ]),
        createToolResultMessage("user_search", "call_1", "Found users"),
        createToolResultMessage("admin_delete", "call_2", "User deleted"),
        createToolResultMessage("debug_log", "call_3", "Logged"),
        createTextMessage("assistant", "I've completed the admin tasks"),
      ];

      // Organization level: No debug tools in production
      const orgProcessors = [
        new ToolCallFilter({ exclude: ["debug_log", "internal_tool"] }),
      ];

      // Product level: Customer-facing agents get token limits
      const productProcessors = [
        new TokenLimiter({ limit: 200, useTiktoken: false }),
      ];

      // Agent level: Customer service agents can't use admin tools
      const customerAgentProcessors = [
        new ToolCallFilter({ exclude: ["admin_delete", "admin_create"] }),
      ];

      const allProcessors = [
        ...orgProcessors,
        ...productProcessors,
        ...customerAgentProcessors,
      ];

      const result = await applyProcessors(messages, allProcessors);

      // Should have removed both debug and admin tools
      const toolCalls = result.filter((msg) => msg.type === "tool_call");
      const toolResults = result.filter((msg) => msg.type === "tool_result");

      expect(
        toolCalls.every(
          (msg) =>
            msg.type === "tool_call" &&
            msg.tools.every(
              (tool) =>
                tool.name !== "debug_log" && tool.name !== "admin_delete"
            )
        )
      ).toBe(true);

      expect(
        toolResults.every(
          (msg) =>
            msg.type === "tool_result" &&
            msg.tool.name !== "debug_log" &&
            msg.tool.name !== "admin_delete"
        )
      ).toBe(true);

      // Should only have user_search tool remaining
      const remainingToolCalls = result.filter(
        (msg) => msg.type === "tool_call"
      );
      if (remainingToolCalls.length > 0) {
        const msg = remainingToolCalls[0] as ToolCallMessage;
        expect(msg.tools).toHaveLength(1);
        expect(msg.tools[0]!.name).toBe("user_search");
      }
    });

    it("should handle conflicting processors gracefully", async () => {
      const messages = [
        createToolCallMessage([
          { name: "search_tool", id: "call_1", input: { query: "test" } },
        ]),
        createToolResultMessage("search_tool", "call_1", "results"),
      ];

      // Conflicting processors: one includes, another excludes the same tool
      const conflictingProcessors = [
        new ToolCallFilter({ include: ["search_tool"] }), // Include search_tool
        new ToolCallFilter({ exclude: ["search_tool"] }), // Exclude search_tool
      ];

      const result = await applyProcessors(messages, conflictingProcessors);

      // The second processor should win (excludes search_tool)
      const toolCallMessages = result.filter((msg) => msg.type === "tool_call");
      expect(toolCallMessages).toHaveLength(0);
    });

    it("should preserve processor performance with large message histories", async () => {
      // Create a large message history
      const messages: Message[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push(createTextMessage("user", `Message ${i}`));
        messages.push(createTextMessage("assistant", `Response ${i}`));
      }

      const processors = [
        new TokenLimiter({ limit: 50, useTiktoken: false }), // Aggressive limiting
        new ToolCallFilter(), // Default: exclude all tools
      ];

      const startTime = Date.now();
      const result = await applyProcessors(messages, processors);
      const endTime = Date.now();

      // Should complete quickly (under 100ms for this test)
      expect(endTime - startTime).toBeLessThan(100);

      // Should be significantly reduced due to token limiting
      expect(result.length).toBeLessThan(messages.length / 2);
    });
  });
});
