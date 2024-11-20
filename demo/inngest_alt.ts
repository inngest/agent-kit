import { defaultRoutingAgent } from "@inngest/agent-kit";
import { Inngest } from "inngest";
import { codeWritingAgentMiddleware } from "./mw";

export const inngest = new Inngest({
  id: "agents",
  middleware: [codeWritingAgentMiddleware({ model: "gpt-3.5-turbo" })],
});

export const fn = inngest.createFunction(
  { id: "agent" },
  { event: "agent/run" },
  async ({ event, codeWritingNetwork }) => {
    // This uses the defaut agentic router to determine which agent to handle first.  You can
    // optinoally specifiy the agent that should execute first, and provide your own logic for
    // handling logic in between agent calls.
    const result = await codeWritingNetwork.run(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      event.data.input as string,
      () => defaultRoutingAgent,
    );

    return result;
  },
);
