import "dotenv/config";
import { anthropic, createAgent, createNetwork, createTool, Tool } from "@inngest/agent-kit";
import { createServer } from "@inngest/agent-kit/server";
import { z } from "zod";

export interface NetworkState {
  // answer from the Database Administrator Agent
  dba_agent_answer?: string;

  // answer from the Security Expert Agent
  security_agent_answer?: string;
}


const dbaAgent = createAgent({
  name: "Database administrator",
  description: "Provides expert support for managing PostgreSQL databases",
  system:
    "You are a PostgreSQL expert database administrator. " +
    "You only provide answers to questions linked to Postgres database schema, indexes, extensions.",
  model: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 4096,
    },
  }),
  tools: [
    createTool({
      name: "provide_answer",
      description: "Provide the answer to the questions",
      parameters: z.object({
        answer: z.string(),
      }),
      handler: async ({ answer }, { network }: Tool.Options<NetworkState>) => {
        network.state.data.dba_agent_answer = answer;
      },
    }),
  ]
});

const securityAgent = createAgent({
  name: "Database Security Expert",
  description:
    "Provides expert guidance on PostgreSQL security, access control, audit logging, and compliance best practices",
  system:
    "You are a PostgreSQL security expert. " +
    "Provide answers to questions linked to PostgreSQL security topics such as encryption, access control, audit logging, and compliance best practices.",
  model: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 4096,
    },
  }),
  tools: [
    createTool({
      name: "provide_answer",
      description: "Provide the answer to the questions",
      parameters: z.object({
        answer: z.string(),
      }),
      handler: async ({ answer }, { network }: Tool.Options<NetworkState>) => {
        network.state.data.security_agent_answer = answer;
      },
    }),
  ]
});

const devOpsNetwork = createNetwork<NetworkState>({
  name: "DevOps team",
  agents: [dbaAgent, securityAgent],
  router: async ({ network }) => {
    if (network.state.data.dba_agent_answer && !network.state.data.security_agent_answer) {
      return securityAgent;
    } else if (network.state.data.security_agent_answer && network.state.data.dba_agent_answer) {
      return;
    }
    return dbaAgent;
  },
});

const server = createServer({
  agents: [],
  networks: [devOpsNetwork],
});

server.listen(3010, () => console.log("Agent kit running!"));
