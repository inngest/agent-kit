import { serve } from "inngest/next";

import { inngest } from "./client";
import { runSupportAgent } from "./functions/support-agent";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runSupportAgent],
});
