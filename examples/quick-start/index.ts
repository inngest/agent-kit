import "dotenv/config";
import { anthropic, createAgent, createNetwork } from "@inngest/agent-kit";
import { createServer } from "@inngest/agent-kit/server";

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
});

const securityAgent = createAgent({
  name: "Database Security Expert",
  description:
    "Provides expert guidance on PostgreSQL security, access control, audit logging, and compliance best practices",
  system:
    "You are a PostgreSQL security expert. " +
    "You only provide answers to questions linked to PostgreSQL security topics such as encryption, access control, audit logging, and compliance best practices.",
  model: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
});

const devOpsNetwork = createNetwork({
  name: "DevOps team",
  agents: [dbaAgent, securityAgent],
  maxIter: 2,
  defaultModel: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
});

const server = createServer({
  agents: [],
  networks: [devOpsNetwork],
});

server.listen(3010, () => console.log("Agent kit running!"));
