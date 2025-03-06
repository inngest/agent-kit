/* eslint-disable */
import "dotenv/config";

import { createServer } from "@inngest/agent-kit/server";
import { Inngest } from "inngest";
import {
  // anthropic,
  createAgent,
  createNetwork,
  createRoutingAgent,
  createTool,
  openai,
  State,
} from "@inngest/agent-kit";
import { z } from "zod";
import Browserbase from "@browserbasehq/sdk";

import { getStagehand, stringToZodSchema } from "./utils.js";

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY as string,
});

const webSearchAgent = createAgent({
  name: "web_search_agent",
  description: "I am a web search agent.",
  system: `You are a web search agent.
  `,
  tools: [
    createTool({
      name: 'navigate',
      description: "Navigate to a given URL",
      parameters: z.object({
        url: z.string().describe("the URL to navigate to")
      }),
      handler: async ({ url }, { step, network }) => {
        return await step?.run("navigate", async () => {
          const stagehand = await getStagehand(network?.state.kv.get('browserbaseSessionID')!);
          await stagehand.page.goto(url)
          return `Navigated to ${url}.`
        })
      }
    }),
    createTool({
      name: 'extract',
      description: "Extract data from the page",
      parameters: z.object({
        instruction: z
          .string()
          .describe("Instructions for what data to extract from the page"),
        schema: z
          .string()
          .describe(
            "A string representing the properties and types of data to extract, for example: '{ name: string, age: number }'"
          ),
      }),
      handler: async ({ instruction, schema }, { step, network }) => {
        return await step?.run('extract', async () => {
          const stagehand = await getStagehand(network?.state.kv.get('browserbaseSessionID')!);
          const zodSchema = stringToZodSchema(schema);
          return await stagehand.page.extract({ instruction, schema: zodSchema })
        })
      }
    }),
    createTool({
      name: 'act',
      description: "Perform an action on the page",
      parameters: z.object({
        action: z
          .string()
          .describe("The action to perform (e.g. 'click the login button')"),
      }),
      handler: async ({ action }, { step, network }) => {
        return await step?.run("act", async () => {
          const stagehand = await getStagehand(network?.state.kv.get('browserbaseSessionID')!);
          return await stagehand.page.act({ action })
        })
      }
    }),
    createTool({
      name: 'observe',
      description: "Observe the page",
      parameters: z.object({
        instruction: z
          .string()
          .describe("Specific instruction for what to observe on the page"),
      }),
      handler: async ({ instruction }, { step, network }) => {
        return await step?.run('observe', async () => {
          const stagehand = await getStagehand(network?.state.kv.get('browserbaseSessionID')!);
          return await stagehand.page.observe({ instruction })
        })
      }
    })
  ]
});



const supervisorRoutingAgent = createRoutingAgent({
  name: "Supervisor",
  description: "I am a Research supervisor.",
  system: `You are a research supervisor.
Your goal is to search for information linked to the user request by augmenting your own research with the "web_search_agent" agent.

Think step by step and reason through your decision.
When the search is complete, call the "done" agent.`,
  model: openai({
    model: "gpt-4o",
  }),
  tools: [
    createTool({
      name: "route_to_agent",
      description: "Route the ticket to the appropriate agent",
      parameters: z.object({
        agent: z.string().describe("The agent to route the ticket to"),
      }),
      handler: async ({ agent }) => {
        return agent;
      },
    }),
  ],
  tool_choice: "route_to_agent",
  lifecycle: {
    onRoute: ({ result }) => {
      const tool = result.toolCalls[0];
      if (!tool) {
        return;
      }
      const toolName = tool.tool.name;
      if (toolName === "done") {
        return;
      } else if (toolName === "route_to_agent") {
        if (
          typeof tool.content === "object" &&
          tool.content !== null &&
          "data" in tool.content &&
          typeof tool.content.data === "string"
        ) {
          return [tool.content.data];
        }
      }
      return;
    },
  },
});

// Create a network with the agents and default router
const searchNetwork = createNetwork({
  name: "Simple Search Network",
  agents: [webSearchAgent],
  maxIter: 15,
  defaultModel: openai({
    model: "gpt-4o",
  }),
  defaultRouter: supervisorRoutingAgent,
});

const inngest = new Inngest({
  id: "Simple Search Agent",
});

const simpleSearchWorkflow = inngest.createFunction(
  {
    id: "simple-search-agent-workflow",
  },
  {
    event: "app/support.ticket.created",
  },
  async ({ step, event }) => {
    const browserbaseSessionID = await step.run("create_browserbase_session", async () => {
      const session = await bb.sessions.create({
        projectId: process.env.BROWSERBASE_PROJECT_ID as string,
        keepAlive: true
      });
      return session.id;
    });


    const response = await searchNetwork.run(event.data.input, {
      state: new State({
        browserbaseSessionID,
      })
    });

    await step.run('close-browserbase-session', async () => {
      const stagehand = await getStagehand(browserbaseSessionID);
      await stagehand.close()
    })

    return {
      response,
    };
  }
);

// Create and start the server
const server = createServer({
  functions: [simpleSearchWorkflow as any],
});

server.listen(3010, () =>
  console.log("Simple search Agent demo server is running on port 3010")
);
