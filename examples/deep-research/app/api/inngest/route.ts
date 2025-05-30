import { inngest } from "@/inngest/client";
import { serve } from "inngest/next";
import { helloWorld } from "@/inngest/functions/hello-world";
import { deepResearchAgent } from "@/inngest/functions/deep-research";
import { simpleAgentFunction } from "@/inngest/functions/simple-agent";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, deepResearchAgent, simpleAgentFunction],
});
