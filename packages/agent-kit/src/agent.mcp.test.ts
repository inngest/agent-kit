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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";

describe("mcp", () => {
  test("initMCP should update tools using SSE Transport", async () => {
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
  test("initMCP should update tools using StreamableHTTP Transport", async () => {
    await newMCPServer(3001, createStreamableHTTPTransport);

    const agent = new Agent({
      name: "test",
      system: "noop",
      mcpServers: [
        {
          name: "test",
          transport: {
            type: "streamable-http",
            url: "http://localhost:3001/mcp",
          },
        },
      ],
    });

    expect(agent.tools.size).toEqual(0);
    await agent["initMCP"]();
    expect(agent.tools.size).toEqual(1);
  });

  // });
});

/**
 * Interface for transport providers
 */
interface TransportProvider {
  createServer: (port: number) => Promise<{
    server: ReturnType<express.Express["listen"]>;
    url: string;
  }>;
}

/**
 * Creates an SSE transport setup for an MCP server
 */
const createSSETransport = (server: Server): TransportProvider => {
  let transport: SSEServerTransport;

  return {
    createServer: async (port: number) => {
      const app = express();

      app.get("/server", async (_req, res) => {
        transport = new SSEServerTransport("/events", res);
        await server.connect(transport);
      });

      app.post("/events", async (req, res) => {
        await transport.handlePostMessage(req, res);
      });

      const httpServer = app.listen(port, () => {});
      return {
        server: httpServer,
        url: `http://localhost:${port}/server`,
      };
    },
  };
};

/**
 * Creates a StreamableHTTP transport setup for an MCP server
 */
const createStreamableHTTPTransport = (server: Server): TransportProvider => {
  return {
    createServer: async (port: number) => {
      const app = express();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      // Handle all MCP requests through the transport
      app.all("/mcp", async (req, res) => {
        await transport.handleRequest(req, res);
      });

      // Connect the transport to the MCP server
      await server.connect(transport);

      const httpServer = app.listen(port, () => {});
      return {
        server: httpServer,
        url: `http://localhost:${port}/mcp`,
      };
    },
  };
};

/**
 * Creates a new MCP server with the specified transport
 */
const newMCPServer = async (
  port: number,
  createTransport?: (server: Server) => TransportProvider
) => {
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

  // Create the transport provider with the server
  const transportProvider = createTransport
    ? createTransport(server)
    : createSSETransport(server);

  // Set up the server using the transport provider and return it
  const { server: httpServer } = await transportProvider.createServer(port);

  return httpServer;
};
