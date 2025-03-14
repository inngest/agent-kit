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
import { Inngest, NonRetriableError } from "inngest";
import { z } from "zod";

import { isLastMessageOfType, lastResult } from "./utils.js";

import { knowledgeBaseDB, releaseNotesDB, ticketsDB } from "./databases.js";
// Create shared tools
const searchKnowledgeBase = createTool({
  name: "search_knowledge_base",
  description: "Search the knowledge base for relevant articles",
  parameters: z.object({
    query: z.string().describe("The search query"),
  }),
  handler: async ({ query }, { step }) => {
    return await step?.run("search_knowledge_base", async () => {
      // Simulate knowledge base search
      const results = knowledgeBaseDB.filter(
        (article) =>
          article.title.toLowerCase().includes(query.toLowerCase()) ||
          article.content.toLowerCase().includes(query.toLowerCase())
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
  model: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
  tools: [
    searchKnowledgeBase,
    createTool({
      name: "update_ticket",
      description: "Update a ticket with a note",
      parameters: z.object({
        ticketId: z.string().describe("The ID of the ticket to update"),
        priority: z.string().describe("The priority of the ticket"),
        status: z.string().describe("The status of the ticket"),
        note: z.string().describe("A note to update the ticket with"),
      }),
      handler: async ({ ticketId, priority, status, note }, { step }) => {
        return await step?.run("update_ticket", async () => {
          // TODO: Update the ticket in the database
          return { message: "Ticket updated successfully" };
        });
      },
    }),
  ],
});

const technicalSupportAgent = createAgent({
  name: "Technical Support",
  description: "I am a technical support agent that helps critical tickets.",
  system: `You are a technical support specialist.
Your goal is to help resolve critical tickets.
Use your expertise to diagnose problems and suggest solutions.
If you need developer input, use the ask_developer tool.`,
  model: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
  tools: [
    searchLatestReleaseNotes,
    createTool({
      name: "ask_developer",
      description: "Ask a developer for input on a technical issue",
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
  system: `You are a supervisor.
Your goal is to answer customer initial request or escalate the ticket if no answer can be provided.
Choose to route tickets to the appropriate agent using the following instructions:
- Critical tickets should be routed to the "Technical Support" agent.
- Actions such as updating the ticket or handling non-critical tickets should be routed to the "Customer Support" agent.

Think step by step and reason through your decision.
When an agent as answered the ticket initial request or updated the ticket, call the "done" tool.`,
  model: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
  tools: [
    createTool({
      name: "done",
      description: "Call this when the ticket is solved or escalated",
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
      const lastMessage = lastResult(network?.state.results);

      // ensure to loop back to the last executing agent if a tool has been called
      if (lastMessage && isLastMessageOfType(lastMessage, "tool_call")) {
        return [lastMessage?.agent.name];
      }

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
const supportNetwork = createNetwork({
  name: "Support Network",
  agents: [customerSupportAgent, technicalSupportAgent],
  defaultModel: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
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

    const response = await supportNetwork.run(ticket.title);

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
