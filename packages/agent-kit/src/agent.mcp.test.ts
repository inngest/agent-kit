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
import { openai } from "inngest";

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
  test.only("it should pass tools into models", async () => {
    const server = await newMCPServer(30000);
    const agent = new Agent({
      name: "test",
      system: "noop",
      mcpServers: [
        {
          name: "test",
          transport: {
            type: "sse",
            url: "http://localhost:30000/server",
          },
        },
      ],
      model: openai({
        model: "gpt-4o",
        baseUrl: process.env.OPENAI_BASE_URL,
        apiKey: process.env.OPENAI_API_KEY,
      }),
      lifecycle: {
        onFinish: ({ result }) => {
          if (result?.toolCalls[0]?.content?.error) {
            throw new Error(JSON.stringify(result.toolCalls[0].content.error));
          }
          return result;
        },
      },
    });
    await agent["initMCP"]();
    await agent.run("do a tool call test: call printf with hello world");
  });
});
let instanceId = 1;
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
      console.log("MCP: Recvd the tool call", JSON.stringify(request));
      if (instanceId > 1) {
        throw new Error(
          `Multiple instances created. this instanceId: ${instanceId}`
        );
      }
      return request.params?.arguments?.format || "";
    } else {
      throw new Error("Resource not found");
    }
  });

  let transport: SSEServerTransport;
  const app = express();

  app.get("/server", async (req, res) => {
    transport = new SSEServerTransport("/events", res);
    console.log(
      `MCP: creating instance: ${instanceId++} with sessionId: ${transport.sessionId}`
    );
    await server.connect(transport);
  });

  app.post("/events", async (req, res) => {
    console.log("MCP: Received POST request", JSON.stringify(req.url));
    await transport.handlePostMessage(req, res);
  });

  return app.listen(port, () => {});
};
