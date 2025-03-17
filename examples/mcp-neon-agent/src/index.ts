/* eslint-disable */
import "dotenv/config";
import {
  anthropic,
  createAgent,
  createNetwork,
  createTool,
} from "@inngest/agent-kit";
import { createServer } from "@inngest/agent-kit/server";
import { createSmitheryUrl } from "@smithery/sdk/config.js"
import { z } from "zod";

const smitheryUrl = createSmitheryUrl("https://server.smithery.ai/neon/ws", {
  "neonApiKey": process.env.NEON_API_KEY
})

const neonAgent = createAgent({
  name: "neon-agent",
  system: `You are a helpful assistant that help manage a Neon account.
  IMPORTANT: Call the 'done' tool when the question is answered.
  `,
  tools: [
    createTool({
      name: "done",
      description: "Call this tool when you are finished with the task.",
      parameters: z.object({
        answer: z.string().describe("Answer to the user's question.")
      }),
      handler: async ({ answer }, { network }) => {
        network?.state.kv.set("answer", answer);
      }
    })
  ],
  mcpServers: [
    {
      name: "neon",
      transport: {
        type: "ws",
        url: smitheryUrl.toString()
      }
    }
  ]
})



const neonAgentNetwork = createNetwork({
  name: "neon-agent",
  agents: [neonAgent],
  defaultModel: anthropic({
    model: "claude-3-5-sonnet-20240620",
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
  defaultRouter: ({ network }) => {
    if (!network?.state.kv.get("answer")) {
      return neonAgent;
    }
    return;
  }
});

// Create and start the server
const server = createServer({
  networks: [neonAgentNetwork]
});

server.listen(3010, () =>
  console.log("Support Agent demo server is running on port 3010")
);
