import { describe, expect, test, vi } from "vitest";
import { createAgent } from "./agent";
import { openai } from "./models";

const mockTools = [
  { name: "read_file", description: "Read a file" },
  { name: "write_file", description: "Write a file" },
  { name: "delete_file", description: "Delete a file" },
  { name: "list_files", description: "List files" },
  { name: "get_user", description: "Get user info" },
  { name: "update_user", description: "Update user info" },
  { name: "remove_user", description: "Remove user" },
];

// Mock the MCP client before tests
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    request: vi.fn().mockResolvedValue({ tools: mockTools }),
    callTool: vi.fn(),
  })),
}));

// Mock transports
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn(),
}));

describe("MCP Tool Filtering", () => {
  const mockMCPServer = {
    name: "test-server",
    transport: { type: "stdio" as const, command: "test", args: [] },
  };

  test("should filter tools using global excludeTools with strings", async () => {
    const agent = createAgent({
      name: "TestAgent",
      system: "Test system",
      model: openai({ model: "gpt-4", apiKey: "test" }),
      mcpServers: [mockMCPServer],
      mcpConfig: {
        excludeTools: ["delete_file", "remove_user"],
      },
    });

    // Initialize MCP to load tools
    await agent["initMCP"]();

    // Check that excluded tools are not present
    expect(agent.tools.has("test-server-delete_file")).toBe(false);
    expect(agent.tools.has("test-server-remove_user")).toBe(false);

    // Check that other tools are present
    expect(agent.tools.has("test-server-read_file")).toBe(true);
    expect(agent.tools.has("test-server-write_file")).toBe(true);
    expect(agent.tools.has("test-server-list_files")).toBe(true);
  });

  test("should filter tools using global excludeTools with regex", async () => {
    const agent = createAgent({
      name: "TestAgent",
      system: "Test system",
      model: openai({ model: "gpt-4", apiKey: "test" }),
      mcpServers: [mockMCPServer],
      mcpConfig: {
        excludeTools: [/delete|remove/i],
      },
    });

    await agent["initMCP"]();

    // Check that tools matching regex are excluded
    expect(agent.tools.has("test-server-delete_file")).toBe(false);
    expect(agent.tools.has("test-server-remove_user")).toBe(false);

    // Check that other tools are present
    expect(agent.tools.has("test-server-read_file")).toBe(true);
    expect(agent.tools.has("test-server-write_file")).toBe(true);
    expect(agent.tools.has("test-server-update_user")).toBe(true);
  });

  test("should filter tools using global includeTools", async () => {
    const agent = createAgent({
      name: "TestAgent",
      system: "Test system",
      model: openai({ model: "gpt-4", apiKey: "test" }),
      mcpServers: [mockMCPServer],
      mcpConfig: {
        includeTools: [/^read_/, /^list_/, "get_user"],
      },
    });

    await agent["initMCP"]();

    // Check that only included tools are present
    expect(agent.tools.has("test-server-read_file")).toBe(true);
    expect(agent.tools.has("test-server-list_files")).toBe(true);
    expect(agent.tools.has("test-server-get_user")).toBe(true);

    // Check that other tools are excluded
    expect(agent.tools.has("test-server-write_file")).toBe(false);
    expect(agent.tools.has("test-server-delete_file")).toBe(false);
    expect(agent.tools.has("test-server-update_user")).toBe(false);
  });

  test("should apply both includeTools and excludeTools", async () => {
    const agent = createAgent({
      name: "TestAgent",
      system: "Test system",
      model: openai({ model: "gpt-4", apiKey: "test" }),
      mcpServers: [mockMCPServer],
      mcpConfig: {
        includeTools: [/^read_/, /^write_/, /^list_/],
        excludeTools: ["write_file"], // Exclude write even though it matches include
      },
    });

    await agent["initMCP"]();

    expect(agent.tools.has("test-server-read_file")).toBe(true);
    expect(agent.tools.has("test-server-list_files")).toBe(true);
    expect(agent.tools.has("test-server-write_file")).toBe(false); // Excluded
    expect(agent.tools.has("test-server-delete_file")).toBe(false); // Not included
  });

  test("should apply server-specific filters", async () => {
    const serverWithFilters = {
      ...mockMCPServer,
      includeTools: [/file$/], // Only tools ending with "file"
      excludeTools: ["delete_file"],
    };

    const agent = createAgent({
      name: "TestAgent",
      system: "Test system",
      model: openai({ model: "gpt-4", apiKey: "test" }),
      mcpServers: [serverWithFilters],
    });

    await agent["initMCP"]();

    // Only tools ending with "file" except delete_file
    expect(agent.tools.has("test-server-read_file")).toBe(true);
    expect(agent.tools.has("test-server-write_file")).toBe(true);
    expect(agent.tools.has("test-server-list_files")).toBe(false); // Doesn't end with "file"
    expect(agent.tools.has("test-server-delete_file")).toBe(false); // Explicitly excluded
    expect(agent.tools.has("test-server-get_user")).toBe(false); // Doesn't match include
  });

  test("should combine server-specific and global filters", async () => {
    const serverWithFilters = {
      ...mockMCPServer,
      includeTools: [/file$/, /user$/], // Server allows file and user tools
    };

    const agent = createAgent({
      name: "TestAgent",
      system: "Test system",
      model: openai({ model: "gpt-4", apiKey: "test" }),
      mcpServers: [serverWithFilters],
      mcpConfig: {
        excludeTools: [/delete|remove/], // Global exclude destructive operations
      },
    });

    await agent["initMCP"]();

    // Should include tools that pass both server and global filters
    expect(agent.tools.has("test-server-read_file")).toBe(true);
    expect(agent.tools.has("test-server-write_file")).toBe(true);
    expect(agent.tools.has("test-server-get_user")).toBe(true);
    expect(agent.tools.has("test-server-update_user")).toBe(true);

    // Should exclude tools that fail either filter
    expect(agent.tools.has("test-server-delete_file")).toBe(false); // Global exclude
    expect(agent.tools.has("test-server-remove_user")).toBe(false); // Global exclude
    expect(agent.tools.has("test-server-list_files")).toBe(false); // Not in server include
  });

  test("should handle empty filter arrays", async () => {
    const agent = createAgent({
      name: "TestAgent",
      system: "Test system",
      model: openai({ model: "gpt-4", apiKey: "test" }),
      mcpServers: [mockMCPServer],
      mcpConfig: {
        includeTools: [],
        excludeTools: [],
      },
    });

    await agent["initMCP"]();

    // All tools should be loaded when filters are empty
    mockTools.forEach((tool) => {
      expect(agent.tools.has(`test-server-${tool.name}`)).toBe(true);
    });
  });

  test("should handle undefined mcpConfig", async () => {
    const agent = createAgent({
      name: "TestAgent",
      system: "Test system",
      model: openai({ model: "gpt-4", apiKey: "test" }),
      mcpServers: [mockMCPServer],
      // No mcpConfig provided
    });

    await agent["initMCP"]();

    // All tools should be loaded when no config
    mockTools.forEach((tool) => {
      expect(agent.tools.has(`test-server-${tool.name}`)).toBe(true);
    });
  });
});
