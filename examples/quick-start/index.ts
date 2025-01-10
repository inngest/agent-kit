import { createAgent, createNetwork, anthropic, createServer } from '@inngest/agent-kit';

const dbaAgent = createAgent({
  name: 'Database administrator',
  description: 'Provides expert support for managing PostgreSQL databases',
  system:
    'You are a PostgreSQL expert database administrator. ' +
    'You help answer questions about Postgres including database schema, indexes, extensions.',
  model: anthropic({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1000,
  }),
});

const devOpsNetwork = createNetwork({
  name: 'DevOps team',
  agents: [dbaAgent],
  defaultModel: anthropic({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1000,
  }),
});
const server = createServer({
  agents: [dbaAgent],
  networks: [devOpsNetwork],
});

server.listen(3010, () => console.log('Agent kit running!'));
