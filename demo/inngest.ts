import { Inngest } from "inngest";
import { Agent, Network, openai } from "../src/index";

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
      agents: [TestWritingAgent],
      provider: provider,
    });
    // This uses the defaut agentic router to determine which agent to handle first.  You can
    // optinoally specifiy the agent that should execute first, and provide your own logic for
    // handling logic in between agent calls.
    const result = await network.run(event.data.input);
    return result;
  },
);

const TestWritingAgent = new Agent({
  name: "Test writing agent",
  instructions: `You are an expert TypeScript engineer who excels at test-driven-development.

Your primary focus is to take system requirements and write unit tests for a set of functions.
`
});
