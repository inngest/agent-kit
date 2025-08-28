import { inngest } from "../client";
import { createCustomerSupportNetwork } from "../networks/customer-support-network";
import { userChannel } from "../../lib/realtime";
import { createState } from "@inngest/agent-kit";
import type { CustomerSupportState } from "../types/state";
import { PostgresHistoryAdapter } from "../db";
import { TEST_USER_ID } from "../../lib/constants";

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
    
    const { threadId, message, userId, history, messageId } = event.data as {
      threadId: string;
      message: string;
      userId: string;
      history: Array<{ type: 'text'; role: 'user' | 'assistant'; content: string; }>;
      messageId: string;
    };
    
    try {
      const network = createCustomerSupportNetwork(
        threadId,
        createState<CustomerSupportState>({
          userId: userId || TEST_USER_ID,
        }, { 
          messages: history,
          threadId 
        }),
        historyAdapter // Use the shared global instance
      );
      
      // Run the network with streaming enabled
      const networkRun = await network.run(message, {
        streaming: {
          publish: async (chunk: AgentMessageChunk) => {
            await step.run(chunk.id, async () => {
              const enrichedChunk = {
                ...chunk,
                data: {
                  ...chunk.data,
                  threadId, // Ensure threadId is in event data for client-side filtering
                  userId, // Also include userId for additional context
                },
            };

            await publish(userChannel(userId).agent_stream(enrichedChunk));
            
            return enrichedChunk;
              // try {
              //   // UNIFIED STREAMING: Publish to user channel with threadId in event data
              //   const enrichedChunk = {
              //     ...chunk,
              //     data: {
              //       ...chunk.data,
              //       threadId, // Ensure threadId is in event data for client-side filtering
              //       userId, // Also include userId for additional context
              //     },
              //   };
              //   await publish(userChannel(userId).agent_stream(enrichedChunk));
              //   return enrichedChunk;
              // } catch (error) {
              //   // Gracefully handle connection errors - streaming is best-effort
              //   if (error && typeof error === "object" && "message" in error) {
              //     const errorMessage = (error as Error).message.toLowerCase();
              //     if (
              //       errorMessage.includes("broken pipe") ||
              //       errorMessage.includes("connection closed") ||
              //       errorMessage.includes("websocket")
              //     ) {
              //       // These are expected with WebSocket connection churn
              //       return chunk;
              //     }
              //   }
              //   // Log other errors but don't fail the stream
              //   console.warn("Streaming publish error:", error);
              //   return chunk;
              // }
            });
          },
        },
        messageId, // Pass the canonical message ID to the network run
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
        await publish(userChannel(userId).agent_stream(errorChunk));
      } catch {}
      
      throw error;
    }
  }
);
