import {
  Agent,
  agenticOpenAiProvider,
  defaultRoutingAgent,
  Network,
} from "@inngest/agent-kit";
import { Inngest, openai } from "inngest";

export const client = new Inngest({ id: "agents" });

export const fn = client.createFunction(
  { id: "agent" },
  { event: "agent/run" },
  async ({ event, step }) => {
    const provider = agenticOpenAiProvider(
      openai({ model: "gpt-3.5-turbo" }),
      step,
    );

    // 1. Single agents
    //
    // Run a single agent as a prompt without a network.
    // const { output, raw } = await CodeWritingAgent.run(event.data.input, { provider });

    // 2. Networks of agents
    const network = new Network({
      agents: [CodeWritingAgent, ExecutingAgent],
      defaultProvider: provider,
      maxIter: 4,
    });

    // This uses the defaut agentic router to determine which agent to handle first.  You can
    // optinoally specifiy the agent that should execute first, and provide your own logic for
    // handling logic in between agent calls.
    const result = await network.run(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      event.data.input as string,
      () => {
        return defaultRoutingAgent.withProvider(provider);
      },
    );

    return result;
  },
);

const CodeWritingAgent = new Agent({
  name: "Code writing agent",
  description: "Writes TypeScript code and tests based off of a given input.",

  lifecycle: {
    afterInfer: ({ call }) => {
      // Does this contain a solution?
      // TODO: Parse filenames out of content.
      return call;
    },
  },

  instructions: `You are an expert TypeScript engineer who excels at test-driven-development. Your primary focus is to take system requirements and write unit tests for a set of functions.

Think carefully about the request that the user is asking for. Do not respond with anything else other than the following XML tags:

- If you would like to write code, add all code within the following tags (replace $filename and $contents appropriately):

<file name="$filename.ts">
    $contents
</file>
`,
});

const ExecutingAgent = new Agent({
  name: "Test execution agent",
  description: "Executes written TypeScript tests",

  lifecycle: {
    enabled: ({ network }) => {
      // Only allow executing of tests if there are files available.
      return network?.state.kv.get("files") !== undefined;
    },
  },

  instructions: `You are an export TypeScript engineer that can execute commands, run tests, debug the output, and make modifications to code.

Think carefully about the request that the user is asking for. Do not respond with anything else other than the following XML tags:

- If you would like to write code, add all code within the following tags (replace $filename and $contents appropriately):

<file name="$filename.ts">
    $contents
</file>

- If you would like to run commands, respond with the following tags:

<command>
  $command
</command>
`,
});
