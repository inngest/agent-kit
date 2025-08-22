import { inngest } from "../client";
import { createCustomerSupportNetwork } from "../networks/customer-support-network";
import { conversationChannel } from "../../lib/realtime";
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
    // Ensure only one run executes per thread at a time to prevent parallel routers/agents
    // concurrency: {
    //   limit: 1,
    //   key: "event.data.threadId",
    // },
    // NOTE: The onStartup property is not a valid Inngest v3 API.
    // Initialization has been moved into a durable step within the handler.
  },
  { event: "agent/chat.requested" },
  async ({ event, step, publish }) => {
    // This step ensures the database tables exist. It's idempotent within a
    // single run and is safe to call here. For a production environment, you
    // would typically run database migrations as part of a deployment script.
    await step.run("initialize-db-tables", () => historyAdapter.initializeTables());
    
    const { threadId, message, userId, history } = event.data as {
      threadId: string;
      message: string;
      userId: string;
      history: Array<{ type: 'text'; role: 'user' | 'assistant'; content: string; }>;
    };
    
    // Debug the incoming history format
    console.log("[runAgentChat] Received history:", {
      threadId,
      messagePreview: message.substring(0, 50) + "...",
      historyLength: history?.length || 0,
      historyItems: history?.map((item, i) => ({
        index: i,
        type: item?.type,
        role: item?.role,
        hasContent: !!item?.content,
        contentLength: item?.content?.length || 0,
        contentPreview: item?.content ? item.content.substring(0, 30) + "..." : "no content"
      })) || []
    });
    
    console.log("[runAgentChat] Function execution started:", {
      threadId,
      timestamp: new Date().toISOString(),
      userId,
    });
    
    // Debug: Log the thread creation process
    console.log("[runAgentChat] About to create network with threadId:", threadId);
    
    try {
      const network = createCustomerSupportNetwork(
        threadId,
        createState({
          userId: userId || TEST_USER_ID,
        }, { 
          messages: history,
          threadId 
        }),
        historyAdapter // Use the shared global instance
      );
      
      // Debug: Log before running network
      console.log("[runAgentChat] About to run network with threadId:", network.state.threadId);
      console.log("[runAgentChat] Network has history adapter:", !!network.history);
      console.log("[runAgentChat] Network history type:", network.history?.constructor?.name);
      
      // CRITICAL: Test if our network.ts changes are being used
      console.log("🧪 [VERSION TEST] Network.run method source check:");
      console.log("Network.run toString preview:", network.run.toString().substring(0, 200));
      
      // Run the network with streaming publish; runtime will emit events automatically
      const result = await network.run(message, {
        streaming: {
          publish: async (chunk: AgentMessageChunk) => {
            // Wrap in Inngest step for durability, retries, and observability
            await step.run(chunk.id, async () => {
              await publish(conversationChannel(threadId).agent_stream(chunk));
              return { published: true, ...chunk };
            });
          },
        },
      });
      
      // Debug: Log after network run
      console.log("[runAgentChat] Network run completed with threadId:", network.state.threadId);
      console.log("[runAgentChat] Final thread state:", {
        threadId: network.state.threadId,
        resultCount: network.state.results.length,
        hasHistory: !!network.history
      });
      
      return {
        success: true,
        threadId,
        result,
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
        },
        timestamp: Date.now(),
        sequenceNumber: 0,
        id: "publish-0:network:error",
      };
      try {
        await publish(conversationChannel(threadId).agent_stream(errorChunk));
      } catch {}
      
      throw error;
    }
  }
);
