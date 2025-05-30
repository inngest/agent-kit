import { realtimeMiddleware } from "@inngest/realtime";
import { EventSchemas, Inngest } from "inngest";

export const inngest = new Inngest({
  id: "realtime-ui-agent-kit-nextjs",
  middleware: [realtimeMiddleware()],
  schemas: new EventSchemas().fromRecord<{
    "database-agent/run": {
      data: {
        query: string;
        threadId: string;
      };
    };
  }>(),
});
