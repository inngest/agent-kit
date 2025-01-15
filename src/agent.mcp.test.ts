/* eslint-disable @typescript-eslint/require-await */
import { Agent } from "./agent";
import { describe, expect, test } from "vitest";
// MCP server tests
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  type ListToolsResult,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse";
import express from "express";

describe("mcp", () => {
  // TODO: Create a new MCP server.

  test("initMCP should update tools", async () => {
    await newMCPServer();
    const agent = new Agent({
      name: "test",
      system: "noop",
      mcpServers: [
        {
          name: "test",
          transport: {
            type: "sse",
            url: "http://localhost:3000/server",
          },
        },
      ],
    });

    expect(agent.tools.size).toEqual(0);
    await agent["initMCP"]();
    expect(agent.tools.size).toEqual(1);
  });
});

const newMCPServer = async () => {
  const server = new Server(
    {
      name: "test server",
      version: "1.0.0",
    },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (): Promise<ListToolsResult> => {
      return {
        tools: [
          {
            name: "printf",
            description: "prints a formatted string",
            inputSchema: {
              type: "object",
              properties: {
                format: "string",
              },
              required: ["format"],
            },
          },
        ],
      };
    }
  );

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "printf") {
      return request.params?.arguments?.format || "";
    } else {
      throw new Error("Resource not found");
    }
  });

  let transport: SSEServerTransport;
  const app = express();

  app.get("/server", async (req, res) => {
    transport = new SSEServerTransport("/events", res);
    await server.connect(transport);
  });

  app.post("/events", async (req, res) => {
    await transport.handlePostMessage(req, res);
  });

  app.listen(3000, () => {
    console.log(`Server is running on port 3000`);
  });

  return app;
};
