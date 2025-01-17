/* eslint-disable @typescript-eslint/no-unused-vars */
import { getDefaultRoutingAgent } from "@inngest/agent-kit";
import { EventSchemas, Inngest } from "inngest";
import { z } from "zod";
import { codeWritingNetworkMiddleware } from "./mw";

export const inngest = new Inngest({
  id: "agents",
  schemas: new EventSchemas().fromZod({
    "agent/run": {
      data: z.object({
        input: z.string(),
      }),
    },
  }),
  middleware: [codeWritingNetworkMiddleware({ model: "gpt-3.5-turbo" })],
});

export const fn = inngest.createFunction(
  { id: "agent" },
  { event: "agent/run" },
  async ({
    event,
    ai: {
      agents: { codeWritingAgent, executingAgent },
      networks: { codeWritingNetwork },
    },
  }) => {
    // 1. Single agents
    //
    // Run a single agent as a prompt without a network.
    const { output, raw } = await codeWritingAgent.run(event.data.input);

    // 2. Networks of agents
    //
    // This uses the defaut agentic router to determine which agent to handle first.  You can
    // optinoally specifiy the agent that should execute first, and provide your own logic for
    // handling logic in between agent calls.
    const result = await codeWritingNetwork.run(event.data.input, {
      router: ({ network }) => {
        if (network.state.kv.has("files")) {
          // Okay, we have some files.  Did an agent run tests?
          return executingAgent;
        }

        return getDefaultRoutingAgent();
      },
    });

    return result;
  }
);
