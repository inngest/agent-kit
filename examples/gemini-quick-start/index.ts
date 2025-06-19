import "dotenv/config";
import { gemini, createAgent, createNetwork, createTool, Tool } from "./agentkit-dist/index.js"; // TODO: change this to published package once merged/deployed
import { createServer } from "./agentkit-dist/server.js";
import { z } from "zod";

export interface NetworkState {
  // answer from the Database Administrator Agent
  dba_agent_answer?: string;

  // answer from the Security Expert Agent
  security_agent_answer?: string;
}


const dbaAgent = createAgent<NetworkState>({
  name: "Database administrator",
  description: "Provides expert support for managing PostgreSQL databases",
  system:
    "You are a PostgreSQL expert database administrator. " +
    "You only provide answers to questions linked to Postgres database schema, indexes, extensions.",
  model: gemini({
    model: "gemini-2.5-flash-lite-preview-06-17"
  }),
  tools: [
    createTool({
      name: "provide_answer",
      description: "Provide the answer to the questions",
      parameters: z.object({
        answer: z.string(),
      }),
      handler: async ({ answer }: { answer: string }, { network }: Tool.Options<NetworkState>) => {
        network.state.data.dba_agent_answer = answer;
      },
    }),
  ]
});

const securityAgent = createAgent<NetworkState>({
  name: "Database Security Expert",
  description:
    "Provides expert guidance on PostgreSQL security, access control, audit logging, and compliance best practices",
  system:
    "You are a PostgreSQL security expert. " +
    "Provide answers to questions linked to PostgreSQL security topics such as encryption, access control, audit logging, and compliance best practices.",
  model: gemini({
    model: "gemini-2.5-pro-flash",
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

// Create a network that coordinates between DBA and Security agents
// The network manages the flow of database-related questions through both agents
const devOpsNetwork = createNetwork<NetworkState>({
  name: "DevOps team",
  maxIter: 6, // Limit to 6 iterations to prevent infinite loops
  agents: [dbaAgent, securityAgent], // Include both DBA and Security experts
  router: async ({ network }) => {
    // Routing logic to determine which agent should respond next
    
    // If DBA has answered but Security hasn't, route to Security agent
    if (network.state.data.dba_agent_answer && !network.state.data.security_agent_answer) {
      return securityAgent;
    } 
    // If both agents have provided answers, stop the conversation
    else if (network.state.data.security_agent_answer && network.state.data.dba_agent_answer) {
      return; // No more agents to route to
    }
    // Default: start with DBA agent for initial database questions
    return dbaAgent;
  },
});

const server = createServer({
  agents: [],
  networks: [devOpsNetwork],
});

server.listen(3010, () => console.log("Agent kit running!"));
