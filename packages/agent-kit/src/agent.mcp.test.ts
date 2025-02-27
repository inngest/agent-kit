/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, test } from "vitest";
import { Agent } from "./agent";
// MCP server tests
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

describe("mcp", () => {
  test("initMCP should update tools", async () => {
    await newMCPServer(3000);
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

  // TODO: We need a mock AI model to test this.
  // test("it should pass tools into models", async () => {
  //   const server = await newMCPServer(3001);
  //   const agent = new Agent({
  //     name: "test",
  //     system: "noop",
  //     mcpServers: [
  //       {
  //         name: "test",
  //         transport: {
  //           type: "sse",
  //           url: "http://localhost:3000/server",
  //         },
  //       },
  //     ],
  //   });

  //   await agent.run("test");
  // });
});

const newMCPServer = async (port: number) => {
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

  return app.listen(port, () => {});
};
