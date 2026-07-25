/* eslint-disable */
import "dotenv/config";
import {
  anthropic,
  createAgent,
  createNetwork,
  createTool,
} from "@inngest/agent-kit";
import { createServer } from "@inngest/agent-kit/server";
import { z } from "zod";

// You.com MCP server configuration
// Uses official MCP server at https://api.you.com/mcp
// Supports both authenticated (YDC_API_KEY) and keyless operation
const youcomMcpServerUrl = "https://api.you.com/mcp";

const youcomResearchAgent = createAgent({
  name: "youcom-research-agent",
  system: `You are a helpful research assistant that uses You.com's web search and research capabilities.

You have access to three powerful tools through the You.com MCP server:
- you-search: Current web search with snippets and source discovery  
- you-contents: Full content extraction from URLs
- you-research: One-shot cited synthesis and comprehensive research reports

Use these tools to provide accurate, up-to-date information with proper citations.

IMPORTANT: Call the 'done' tool when you have completed the research task.`,
  tools: [
    createTool({
      name: "done",
      description: "Call this tool when you have finished the research task and provided a complete answer.",
      parameters: z.object({
        answer: z.string().describe("Complete research answer with sources and citations"),
        sources: z.array(z.string()).optional().describe("List of source URLs used in the research")
      }),
      handler: async ({ answer, sources }, { network }) => {
        network?.state.kv.set("answer", answer);
        if (sources) {
          network?.state.kv.set("sources", sources);
        }
        return "Research task completed successfully.";
      }
    })
  ],
  mcpServers: [
    {
      name: "youcom",
      transport: {
        type: "sse",
        url: youcomMcpServerUrl,
        // Add auth header if YDC_API_KEY is present
        ...(process.env.YDC_API_KEY && {
          requestInit: {
            headers: {
              'Authorization': `Bearer ${process.env.YDC_API_KEY}`
            }
          }
        })
      }
    }
  ]
});

const youcomResearchNetwork = createNetwork({
  name: "youcom-research",
  agents: [youcomResearchAgent],
  defaultModel: anthropic({
    model: "claude-3-5-sonnet-20240620",
    defaultParameters: {
      max_tokens: 2000,
    },
  }),
  defaultRouter: ({ network }) => {
    if (!network?.state.kv.get("answer")) {
      return youcomResearchAgent;
    }
    return;
  }
});

// Create and start the server
const server = createServer({
  networks: [youcomResearchNetwork]
});

server.listen(3010, () =>
  console.log("You.com Research Agent demo server is running on port 3010")
);