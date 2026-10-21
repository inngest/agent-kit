import {
  anthropic,
  createAgent,
  createNetwork,
  createState,
  createTool,
  type Message,
} from "@inngest/agent-kit";
import type { ChatRequestEvent } from "@inngest/use-agent";
import { z } from "zod";

import { inngest } from "../client";
import { userChannel } from "../realtime";

const orders = new Map([
  [
    "1001",
    {
      item: "Mechanical keyboard",
      total: 129,
      status: "delivered",
      placedAt: "2026-09-28",
    },
  ],
  [
    "1002",
    {
      item: "USB-C dock",
      total: 89,
      status: "shipped",
      placedAt: "2026-10-12",
    },
  ],
]);

const getOrder = createTool({
  name: "get_order",
  description: "Look up an order by its id.",
  parameters: z.object({ orderId: z.string() }),
  handler: ({ orderId }) => {
    const order = orders.get(orderId);
    if (!order) return { error: `No order with id ${orderId}` };
    return { orderId, ...order };
  },
});

const supportAgent = createAgent({
  name: "Support Agent",
  system: `You are a friendly support agent for an online electronics store.
Use get_order to look up orders. Keep answers short.`,
  model: anthropic({
    model: "claude-haiku-4-5",
    defaultParameters: { max_tokens: 1024 },
  }),
  tools: [getOrder],
});

const supportNetwork = createNetwork({
  name: "Support Network",
  agents: [supportAgent],
  maxIter: 10,
  // Call the agent again after each tool call; stop once it answers in text.
  router: ({ callCount, lastResult }) => {
    if (callCount === 0 || lastResult?.toolCalls.length) return supportAgent;
    return undefined;
  },
});

export const runSupportAgent = inngest.createFunction(
  { id: "run-support-agent" },
  { event: "agent/chat.requested" },
  async ({ event, publish }) => {
    const { userMessage, threadId, history, userId, channelKey } =
      event.data as ChatRequestEvent;
    const channel = userChannel(channelKey || userId!);
    await supportNetwork.run(userMessage, {
      state: createState(
        {},
        { messages: history as Message[] | undefined, threadId }
      ),
      streaming: {
        publish: async (chunk) => {
          await publish(channel.agent_stream(chunk));
        },
        // AgentKit publishes each model response once it is complete; this
        // splits the text into small deltas so the UI shows it arriving.
        simulateChunking: true,
      },
    });
  }
);
