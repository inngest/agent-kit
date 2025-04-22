/* eslint-disable */
import "dotenv/config";
import {
  anthropic,
  createAgent,
  createNetwork,
  createRoutingAgent,
  createTool,
} from "@inngest/agent-kit";
import { createServer } from "@inngest/agent-kit/server";
import { Inngest, NonRetriableError, openai } from "inngest";
import { z } from "zod";

import { knowledgeBaseDB, releaseNotesDB, ticketsDB } from "./databases.js";
// Create shared tools
const searchKnowledgeBase = createTool({
  name: "search_knowledge_base",
  description: "Search the knowledge base for relevant articles",
  parameters: z.object({
    keyword: z.string().describe("A keyword to search for"),
  }),
  handler: async ({ keyword }, { step }) => {
    return await step?.run("search_knowledge_base", async () => {
      // Simulate knowledge base search
      const results = knowledgeBaseDB.filter(
        (article) =>
          article.title.toLowerCase().includes(keyword.toLowerCase()) ||
          article.content.toLowerCase().includes(keyword.toLowerCase())
      );
      return results;
    });
  },
});

const searchLatestReleaseNotes = createTool({
  name: "search_latest_release_notes",
  description: "Search the latest release notes for relevant articles",
  parameters: z.object({
    query: z.string().describe("The search query"),
  }),
  handler: async ({ query }, { step }) => {
    return await step?.run("search_latest_release_notes", async () => {
      // Simulate knowledge base search
      const results = releaseNotesDB.filter(
        (releaseNote) =>
          releaseNote.title.toLowerCase().includes(query.toLowerCase()) ||
          releaseNote.content.toLowerCase().includes(query.toLowerCase())
      );
      return results;
    });
  },
});

const replyToCustomer = createTool({
  name: "reply_to_customer",
  description: "Call this when the ticket is solved, escalated or if more information is needed",
  parameters: z.object({
    message: z.string().describe("The message to reply to the customer"),
  }),
  handler: async ({ message }, { network }) => {
    network?.state.kv.set("reply_to_customer", message);
  },
});

const getTicketDetails = async (ticketId: string) => {
  const ticket = ticketsDB.find((t) => t.id === ticketId);
  return ticket || { error: "Ticket not found" };
};

// Create our agents
const customerSupportAgent = createAgent({
  name: "Customer Support",
  description:
    "I am a customer support agent that helps customers with their inquiries.",
  system: `You are a helpful customer support agent.
Your goal is to assist customers with their questions and concerns.
Be professional, courteous, and thorough in your responses.`,
  tools: [
    searchKnowledgeBase,
    replyToCustomer,
  ],
});

const technicalSupportAgent = createAgent({
  name: "Technical Support",
  description: "I am a technical support agent that helps critical tickets.",
  system: `You are a technical support specialist.
Your goal is to help resolve technical issues.
Use your expertise to quickly diagnose problems, do not ask the customer for more information.`,
  tools: [
    searchLatestReleaseNotes,
    replyToCustomer,
    createTool({
      name: "ask_developer",
      description: "Ask a developer for context on a technical issue",
      parameters: z.object({
        question: z
          .string()
          .describe("The technical question for the developer"),
        context: z.string().describe("Additional context about the issue"),
      }),
      handler: async ({ question, context }, { step }) => {
        if (!step) {
          return { error: "This tool requires step context" };
        }

        // Normally, we would store or send the question and context to a developer.
        // For this example, we'll just wait for the developer to respond.

        // Wait for developer response event
        const developerResponse = await step.waitForEvent(
          "developer.response",
          {
            event: "app/support.ticket.developer-response",
            timeout: "4h",
            match: "data.ticketId",
          }
        );

        if (!developerResponse) {
          return { error: "No developer response provided" };
        }

        return {
          developerResponse: developerResponse.data.answer,
          responseTime: developerResponse.data.timestamp,
        };
      },
    }),
  ],
});

const supervisorRoutingAgent = createRoutingAgent({
  name: "Supervisor",
  description: "I am a Support supervisor.",
  system: `You are a Support supervisor.
Your goal is to answer customer initial request using the following instructions:

- Critical tickets can be resolved by the "Technical Support" agent.
- Non-technical tickets can be resolved by the "Customer Support" agent.

Think step by step and reason through your decision.`,
  tools: [
    createTool({
      name: "reply_to_customer",
      description: "Call this when the ticket is solved, escalated or if the agents need more information",
      handler: async () => {},
    }),
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
  lifecycle: {
    onRoute: ({ result, network }) => {
      if (network?.state.kv.get("reply_to_customer")) {
        return;
      }

      const lastAgentResult = network?.state.results?.[network.state.results.length - 1];
      const lastMessage = lastAgentResult?.output[lastAgentResult.output.length - 1];

      // ensure to loop back to the last executing agent if a tool has been called
      if (lastMessage && lastMessage.type === "tool_call") {
        return [lastAgentResult.agentName];
      }

      const tool = result.toolCalls[0];
      if (!tool) {
        return;
      }
      const toolName = tool.tool.name;
      if (toolName === "reply_to_customer") {
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
const supportNetwork = createNetwork({
  name: "Support Network",
  agents: [customerSupportAgent, technicalSupportAgent],
  defaultModel: openai({
    model: "gpt-4.1",
  }),
  // maxIter: 10,
  router: supervisorRoutingAgent,
});

const inngest = new Inngest({
  id: "Support Agent",
});

const supportAgentWorkflow = inngest.createFunction(
  {
    id: "support-agent-workflow",
  },
  {
    event: "app/support.ticket.created",
  },
  async ({ step, event }) => {
    const ticket = await step.run("get_ticket_details", async () => {
      const ticket = await getTicketDetails(event.data.ticketId);
      return ticket;
    });

    if (!ticket || "error" in ticket) {
      throw new NonRetriableError(`Ticket not found: ${ticket.error}`);
    }

    const response = await supportNetwork.run(`A customer has opened a ticket with the following title: ${ticket.title}`);

    return {
      response,
      ticket,
    };
  }
);

// Create and start the server
const server = createServer({
  functions: [supportAgentWorkflow as any],
});

server.listen(3010, () =>
  console.log("Support Agent demo server is running on port 3010")
);
