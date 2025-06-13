import {
  createNetwork,
  createAgent,
  openai,
  createState,
  TextMessage,
  Message,
  AgentResult,
} from "../agentkit-dist";
import { inngest } from "../client";
import { PostgresHistoryAdapter } from "../db";
import { config } from "../config";

// Define the network state interface
interface NetworkState {
  query: string | undefined;
  networkComplete: boolean;
  response?: string;
  userId: string;
}

// Initialize the PostgreSQL history adapter
const historyAdapter = new PostgresHistoryAdapter<NetworkState>(
  config.database
);

// The setup-db script is the recommended way to initialize the database.
// The in-app initialization is removed to enforce best practices.
// if (config.initializeDatabase) {
//   historyAdapter.initializeTables().catch(console.error);
// }

// Create the Inngest function
export const simpleAgentFunction = inngest.createFunction(
  { id: "simple-agent-workflow" },
  { event: "simple-agent/run" },
  async ({ step, event, publish }) => {
    // ========================================
    // HYBRID HISTORY PATTERN
    // ========================================
    // This function implements a hybrid approach:
    // 1. Client can optionally provide threadId for existing conversations
    // 2. If no threadId provided, AgentKit calls history.createThread automatically
    // 3. Client can send conversation history to skip database reads (performance)
    // 4. Server falls back to history.get if client has no history (e.g., refresh)
    // 5. Server always saves new results via history.appendResults

    // ========================================
    // EXTRACT EVENT DATA
    // ========================================
    const {
      query,
      threadId,
      userId,
      agentResults = [],
      tempChannelId,
    } = event.data;
    const actualUserId = userId || config.defaultUserId;

    console.log(`🎯 Processing query: "${query}"`);
    console.log(`👤 User ID: ${actualUserId}`);
    console.log(`🧵 Thread ID: ${threadId || "WILL BE CREATED BY AGENTKIT"}`);
    console.log(`📚 Client provided ${agentResults.length} messages`);
    if (tempChannelId) {
      console.log(`📡 Temp channel: ${tempChannelId}`);
    }

    // ========================================
    // RECONSTRUCT CLIENT HISTORY (IF PROVIDED)
    // ========================================
    const initialHistory = agentResults.map(
      (r: any) =>
        new AgentResult(
          r.agentName,
          r.output,
          r.toolCalls,
          new Date(r.createdAt)
        )
    );

    // ========================================
    // CREATE SIMPLE CHAT AGENT
    // ========================================
    const simpleAgent = createAgent<NetworkState>({
      name: "simple_agent",
      description: "A simple agent with hybrid history management",
      system: `You are a helpful assistant that can answer questions and engage in conversation.

When responding:
1. Be clear and concise
2. Use markdown formatting when appropriate
3. If you don't know something, say so
4. Reference previous conversation context when relevant

You have access to conversation history that may come from the client or database.`,
      model: openai({
        model: "gpt-4o",
      }),
      lifecycle: {
        onStart: async ({ prompt, history }) => {
          const conversationHistory = history || [];
          console.log("======== AGENT ON_START ========");
          console.log(`📝 System prompt: ${prompt.length} messages`);
          console.log(
            `📚 Conversation history: ${conversationHistory.length} messages`
          );
          console.log("================================");
          return { prompt, history: conversationHistory, stop: false };
        },
      },
    });

    // ========================================
    // CREATE NETWORK STATE
    // ========================================
    const state = createState<NetworkState>(
      {
        query,
        networkComplete: false,
        userId: actualUserId,
      },
      {
        results: initialHistory,
        threadId, // May be undefined - AgentKit will create via history.createThread
      }
    );

    // ========================================
    // RESPONSE TRACKING
    // ========================================
    let hasPublishedResponse = false;
    let responseToPublish: any = null;

    // ========================================
    // PUBLISH TO MULTIPLE CHANNELS
    // ========================================
    const publishToChannels = async (data: any) => {
      const channels = [];

      // Always publish to the real threadId channel
      if (state.threadId) {
        channels.push(`chat.${state.threadId}`);
      }

      // For new conversations, also publish to temp channel
      if (!threadId && tempChannelId) {
        channels.push(`chat.${tempChannelId}`);
      }

      console.log(`📡 Publishing to channels: ${channels.join(", ")}`);

      // Use step.run with unique IDs for each publish call
      for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        await step.run(`publish-to-channel-${i}-${channel.replace(/[^a-zA-Z0-9]/g, '-')}`, async () => {
          return await publish({
            channel,
            topic: "messages",
            data,
          });
        });
      }
    };

    // ========================================
    // CREATE NETWORK WITH FULL AGENTKIT HISTORY
    // ========================================
    const simpleNetwork = createNetwork<NetworkState>({
      name: "simple_network",
      agents: [simpleAgent],
      defaultModel: openai({
        model: "gpt-4o",
      }),
      defaultState: state,
      history: {
        // ========================================
        // AGENTKIT THREAD CREATION
        // ========================================
        createThread: async (ctx) => {
          console.log("🆕 AgentKit calling history.createThread...");
          return await historyAdapter.createThread(ctx);
        },

        // ========================================
        // CONDITIONAL HISTORY LOADING
        // ========================================
        get: async (ctx) => {
          // If client provided history, skip database read
          if (initialHistory.length > 0) {
            console.log("⚡ Skipping database read - using client history");
            return []; // Return empty to avoid overwriting client history
          }

          // Otherwise, load from database for existing conversations
          console.log(
            `📚 Loading history for thread ${ctx.threadId} from database...`
          );
          return await historyAdapter.get(ctx);
        },

        // ========================================
        // AGENTKIT RESULT PERSISTENCE
        // ========================================
        appendResults: async (ctx) => {
          console.log("💾 AgentKit calling history.appendResults...");
          console.log("📊 appendResults context:", {
            threadId: ctx.threadId,
            newResultsCount: ctx.newResults?.length || 0,
            stateResultsCount: ctx.state.results.length,
            hasStep: !!ctx.step,
          });

          if (ctx.newResults && ctx.newResults.length > 0) {
            console.log(
              "📝 New results to save:",
              ctx.newResults.map((r) => ({
                agentName: r.agentName,
                checksum: r.checksum,
                outputLength: r.output?.length || 0,
                toolCallsLength: r.toolCalls?.length || 0,
              }))
            );
          }

          return await historyAdapter.appendResults(ctx);
        },
      },
      router: async ({
        network,
        callCount,
      }: {
        network: any;
        callCount: number;
      }) => {
        const data = network.state.data;

        if (data.networkComplete) {
          console.log("🛑 Router: Network already complete, stopping");
          return undefined;
        }

        if (callCount === 0) {
          console.log("🚀 Router: First call, scheduling simple_agent to run");
          console.log(
            `📊 Current state has ${network.state.results.length} messages`
          );
          return simpleAgent;
        }

        if (callCount > 0 && !hasPublishedResponse) {
          console.log("📝 Router: Agent has run, processing response...");

          const lastResult =
            network.state.results[network.state.results.length - 1];

          if (lastResult && lastResult.output.length > 0) {
            console.log(
              "✅ Router: Found agent response, extracting message..."
            );

            const lastMessage = lastResult.output.find(
              (msg: Message) => msg.type === "text"
            ) as TextMessage;

            if (lastMessage?.type === "text") {
              console.log(
                "💬 Router: Extracted text message, publishing to UI..."
              );

              const responseContent =
                typeof lastMessage.content === "string"
                  ? lastMessage.content
                  : lastMessage.content[0].text;

              data.response = responseContent;
              data.networkComplete = true;
              hasPublishedResponse = true;

              responseToPublish = {
                message: lastMessage,
                threadId: network.state.threadId,
              };
            }
          }
        }

        console.log("🏁 Router: Conversation turn complete, stopping network");
        return undefined;
      },
      maxIter: 1,
    });

    // ========================================
    // RUN THE NETWORK WITH FULL AGENTKIT HISTORY
    // ========================================
    console.log("🚀 Starting network execution with AgentKit history...");
    const response = await simpleNetwork.run(query, { state });
    console.log("✅ Network execution completed");
    console.log(`🆔 Final thread ID: ${response.state.threadId}`);

    // ========================================
    // PUBLISH RESPONSE IF GENERATED
    // ========================================
    if (responseToPublish) {
      await publishToChannels(responseToPublish);
      console.log("📡 Router: Response published to UI successfully");
    }

    // ========================================
    // EXTRACT NEW RESULTS FOR CLIENT
    // ========================================
    const newResults = response.state
      .getResultsFrom(initialHistory.length)
      .map((result: AgentResult) => result.export());

    console.log(`📤 Extracted ${newResults.length} new results for client`);

    // ========================================
    // PUBLISH COMPLETION EVENT
    // ========================================
    await publishToChannels({
      status: "complete",
      threadId: response.state.threadId,
      newResults,
      totalMessages: response.state.results.length,
    });
    console.log("📡 Completion event published to client");

    // ========================================
    // RETURN AGENTKIT RESULTS
    // ========================================
    return {
      response: response.state.data.response,
      threadId: response.state.threadId,
      newResults,
      totalMessages: response.state.results.length,
    };
  }
);
