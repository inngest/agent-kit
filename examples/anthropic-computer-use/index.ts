import { createAgent, createNetwork, anthropic, createServer } from '../../src/index';
import { computerUse } from "../../src/tools/index";

const dbaAgent = createAgent({
  name: 'Browser',
  description: 'Browses the internet like a G',
  system: 'You do stuff',
  tools: [computerUse()],
  model: anthropic({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1000,
  }),
});

const securityAgent = createAgent({
  name: 'Database Security Expert',
  description: 'Provides expert guidance on PostgreSQL security, access control, audit logging, and compliance best practices',
  system: 'You are a PostgreSQL security expert. ' +
    'You only provide answers to questions linked to PostgreSQL security topics such as encryption, access control, audit logging, and compliance best practices.',
  model: anthropic({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1000,
  }),
});

const devOpsNetwork = createNetwork({
  name: 'Remote Hands',
  agents: [dbaAgent, securityAgent],
  maxIter: 2,
  defaultModel: anthropic({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1000,
  }),
});

// serve AgentKit to external requests via Inngest.
const server = createServer({
  agents: [],
  networks: [devOpsNetwork],
});

server.listen(3000, () => console.log('Agent kit running!'));
