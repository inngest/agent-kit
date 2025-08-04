import { inngest } from "../client";
import { createCustomerSupportNetwork } from "../networks/customer-support-network";
import { conversationChannel, type AgentMessageChunk } from "../../lib/realtime";
import { createState } from "@inngest/agent-kit";
import type { CustomerSupportState } from "../types/state";
import { PostgresHistoryAdapter } from "../db";

// Instantiate the history adapter ONCE, in the global scope.
// This is the most important step to prevent connection pool exhaustion in a
// serverless environment. A single function container will reuse this instance
// and its underlying connection pool across multiple invocations.
const historyAdapter = new PostgresHistoryAdapter<CustomerSupportState>({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5431/use_agent_db",
  // Note: While you can configure pool size here (e.g., { max: 5 }), the
  // "too many clients" error is often due to too many function *containers*
  // spinning up. The best solution is a server-side connection pooler like PgBouncer.
});

export const runAgentChat = inngest.createFunction(
  {
    id: "run-agent-chat",
    name: "Run Agent Chat",
    // NOTE: The onStartup property is not a valid Inngest v3 API.
    // Initialization has been moved into a durable step within the handler.
  },
  { event: "agent/chat.requested" },
  async ({ event, step, publish }) => {
    // This step ensures the database tables exist. It's idempotent within a
    // single run and is safe to call here. For a production environment, you
    // would typically run database migrations as part of a deployment script.
    await step.run("initialize-db-tables", () => historyAdapter.initializeTables());
    
    const { threadId, message, customerId, history } = event.data as {
      threadId: string;
      message: string;
      customerId: string;
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
      customerId,
    });
    
    // Publish initial status
    const initialStatusChunk: AgentMessageChunk = {
      event: "run.started",
      data: {
        networkRunId: `network-${Date.now()}`,
        messageId: `msg-${Date.now()}`,
      },
      timestamp: Date.now(),
      sequenceNumber: 1,
    };
    await step.run("publish-initial-status", () => 
      publish(
        conversationChannel(threadId).agent_stream(initialStatusChunk)
      )
    );
    
    try {
      const network = createCustomerSupportNetwork(
        publish,
        step,
        threadId,
        createState<CustomerSupportState>({
          customerId,
        }, { 
          messages: history,
          threadId 
        }),
        historyAdapter // Use the shared global instance
      );
      
      // Run the network (no step wrapper needed - network handles steps internally)
      const result = await network.run(message);
      
      return {
        success: true,
        threadId,
        result,
      };
    } catch (error) {
      // Publish error
      const errorChunk: AgentMessageChunk = {
        event: "error",
        data: {
          error: error instanceof Error ? error.message : "An unknown error occurred",
          networkRunId: `network-${Date.now()}`,
          messageId: `error-msg-${Date.now()}`,
          errorType: error instanceof Error ? error.constructor.name : "Unknown",
          recoverable: true, // Most errors are recoverable by retrying
          agentId: "network", // Indicates this is a network-level error
        },
        timestamp: Date.now(),
        sequenceNumber: 999,
      };
      await step.run("publish-error", () =>
        publish(
          conversationChannel(threadId).agent_stream(errorChunk)
        )
      );
      
      throw error;
    }
  }
);
