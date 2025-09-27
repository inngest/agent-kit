import { inngest } from "../client";
import { createInsightsNetwork } from "../sql-agents/network";
import { userChannel } from "../../lib/realtime";
import { createState, type Message } from "@inngest/agent-kit";
import type { InsightsAgentState } from "../sql-agents/event-matcher";
import { PostgresHistoryAdapter } from "../db";
import type { AgentMessageChunk } from '@inngest/agent-kit';
import type { ChatRequestEvent } from '@inngest/use-agent';
import { v4 as uuidv4 } from "uuid";

// Instantiate the history adapter ONCE, in the global scope.
// This is the most important step to prevent connection pool exhaustion in a
// serverless environment. A single function container will reuse this instance
// and its underlying connection pool across multiple invocations.
const historyAdapter = new PostgresHistoryAdapter<InsightsAgentState>({
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
    
    const { threadId: providedThreadId, userMessage, userId, channelKey, history } = event.data as ChatRequestEvent;
    const threadId = providedThreadId || uuidv4();
    
    // Validate required userId
    if (!userId) {
      throw new Error("userId is required for agent chat execution");
    }
    
    try {
      const clientState = (userMessage as any)?.state || {};
      const network = createInsightsNetwork(
        threadId,
        createState<InsightsAgentState>(
          {
            userId,
            ...(clientState as Partial<InsightsAgentState>),
          } as InsightsAgentState,
          {
            messages: history as Message[] | undefined,
            threadId,
          }
        ),
        historyAdapter // Use the shared global instance
      );
      
      // Determine the target channel for publishing (channelKey takes priority)
      const targetChannel = channelKey || userId;
      
      // Run the network with streaming enabled
      await network.run(userMessage, {
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
