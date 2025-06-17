import { inngest } from "@/inngest/client";
import { serve } from "inngest/next";
import { simpleAgentFunction } from "@/inngest/functions/simple-agent";
import { simpleAgentFunction2 } from "@/inngest/functions/simple-agent-2";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    simpleAgentFunction,
    simpleAgentFunction2, // Testing: messages-based client-authoritative mode
    // Add other Inngest functions here as you create them
  ],
});
