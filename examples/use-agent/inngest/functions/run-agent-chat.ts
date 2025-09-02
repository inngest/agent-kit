import { inngest } from "../client";
import { createCustomerSupportNetwork } from "../networks/customer-support-network";
import { userChannel } from "../../lib/realtime";
import { createState } from "@inngest/agent-kit";
import type { CustomerSupportState } from "../types/state";
import { PostgresHistoryAdapter } from "../db";

// Inline type to avoid depending on private dist paths
type AgentMessageChunk = {
  event: string;
  data: Record<string, any>;
  timestamp: number;
  sequenceNumber: number;
  id: string;
};

// Instantiate the history adapter ONCE, in the global scope.
// This is the most important step to prevent connection pool exhaustion in a
// serverless environment. A single function container will reuse this instance
// and its underlying connection pool across multiple invocations.
const historyAdapter = new PostgresHistoryAdapter<CustomerSupportState>({
  // connectionString is now managed by the shared pool module.
});

export const runAgentChat = inngest.createFunction(
  {
    id: "run-agent-chat",
    name: "Run Agent Chat",
    // concurrency: {
    //   limit: 1,
    //   key: "event.data.threadId",
    // },
  },
  { event: "agent/chat.requested" },
  async ({ event, step, publish }) => {
    // This step ensures the database tables exist. For a production environment, you
    // would typically run database migrations as part of a deployment script.
    await step.run("initialize-db-tables", () => historyAdapter.initializeTables());
    
    const { threadId, userMessage, userId, channelKey, history } = event.data as {
      threadId: string;
      userMessage: {
        id: string;
        content: string;
        role: 'user';
        state?: Record<string, unknown>;
        clientTimestamp?: string;
        systemPrompt?: string;
      };
      userId: string;
      channelKey?: string; // NEW: Optional channel key for flexible subscriptions
      history: Array<{ type: 'text'; role: 'user' | 'assistant'; content: string; }>;
    };
    
    // Validate required userId
    if (!userId) {
      throw new Error("userId is required for agent chat execution");
    }
    
    try {
      const network = createCustomerSupportNetwork(
        threadId,
        createState<CustomerSupportState>({
          userId,
        }, { 
          messages: history,
          threadId 
        }),
        historyAdapter // Use the shared global instance
      );
      
      // Convert the received userMessage to the proper UserMessage type with Date object
      const userMessageWithDate = {
        ...userMessage,
        clientTimestamp: userMessage.clientTimestamp ? new Date(userMessage.clientTimestamp) : undefined,
      };

      // Determine the target channel for publishing (channelKey takes priority)
      const targetChannel = channelKey || userId;
      
      // Run the network with streaming enabled
      await network.run(userMessageWithDate, {
        streaming: {
          publish: async (chunk: AgentMessageChunk) => {
            await publish(userChannel(targetChannel).agent_stream(chunk));
          },
        },
      });

      return {
        success: true,
        threadId,
        message: "Agent network completed successfully"
      };
    } catch (error) {
      // Best-effort error event publish; ignore errors here
      const errorChunk: AgentMessageChunk = {
        event: "error",
        data: {
          error: error instanceof Error ? error.message : "An unknown error occurred",
          scope: "network",
          recoverable: true,
          agentId: "network",
          threadId, // Include threadId for client filtering
          userId, // Include userId for channel routing
        },
        timestamp: Date.now(),
        sequenceNumber: 0,
        id: "publish-0:network:error",
      };
      try {
        // Use the same target channel as the main flow
        const targetChannel = channelKey || userId;
        await publish(userChannel(targetChannel).agent_stream(errorChunk));
      } catch {}
      
      throw error;
    }
  }
);
