import { Inngest } from "inngest";
import { Agent, defaultRoutingAgent, Network, openai } from "../src/index";

export const client = new Inngest({ id: "agents" });

export const fn = client.createFunction(
  { id: "agent" },
  { event: "agent/run" },
  async ({ event, step }) => {

    const provider = openai("gpt-4o-mini", step);


    // 1. Single agents

    // Run a single agent as a prompt without a network.
    // const [output, raw] = await TestWritingAgent.run(event.data.input, { provider });


    // 2. Networks of agents

    // Run a network of agents.
    const network = new Network({
      agents: [TestWritingAgent, ExecutingAgent],
      defaultProvider: provider,
    });

    // This uses the defaut agentic router to determine which agent to handle first.  You can
    // optinoally specifiy the agent that should execute first, and provide your own logic for
    // handling logic in between agent calls.
    const result = await network.run(event.data.input, ({ network }) => {
      return defaultRoutingAgent.withProvider(provider);
    });

    return result;
  },
);

const TestWritingAgent = new Agent({
  name: "Test writing agent",
  description: "Writes TypeScript tests based off of a given input.",
  instructions: `You are an expert TypeScript engineer who excels at test-driven-development. Your primary focus is to take system requirements and write unit tests for a set of functions.

Think carefully about the request that the user is asking for. Make your tone concise and helpful.

If you would like to write code, add all code within the following tags (replace $filename and $contents appropriately):

<file name="$filename.ts">
    $contents
</file>

Once you are satisfied with the solution, wrap your answer with <solution>, including any <file> tags as necessary.
`
});

const ExecutingAgent = new Agent({
  name: "Test execution agent",
  description: "Executes written TypeScript tests",
  instructions: `You are an export TypeScript engineer that can execute commands, run tests, debug the output, and make modifications to code.

Think carefully about the request that the user is asking for. Make your tone concise and helpful.

If you would like to write code, add all code within the following tags (replace $filename and $contents appropriately):

<file name="$filename.ts">
    $contents
</file>

If you would like to run commands, respond with the following tags:

<command>
  $command
</command>
`
});
