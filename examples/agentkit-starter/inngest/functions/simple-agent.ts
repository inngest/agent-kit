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
  userId: string;
}

// Simple helper to convert UI messages to AgentResults (for client-authoritative mode)
function convertMessagesToAgentResults(messages: Message[]): AgentResult[] {
  const results: AgentResult[] = [];
  const baseTimestamp = new Date();
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.type === "text") {
      const agentName = message.role === "user" ? "user" : "simple_agent";
      // Use incremental timestamps to maintain proper ordering
      const timestamp = new Date(baseTimestamp.getTime() + i * 1000); // 1 second apart
      
      results.push(new AgentResult(
        agentName,
        [message],
        [], // No tool calls for simple message conversion
        timestamp
      ));
    }
  }
  
  return results;
}

// Create the Inngest function
export const simpleAgentFunction = inngest.createFunction(
  { id: "simple-agent-workflow" },
  { event: "simple-agent/run" },
  async ({ step, event, publish }) => {
    // ========================================
    // EXTRACT EVENT DATA
    // ========================================
    const {
      query,
      threadId,
      userId,
      messages = [], // Simple Message objects from client
      streamId, // Single channel for real-time communication
    } = event.data;
   
    const actualUserId = userId || config.defaultUserId;

    // ========================================
    // CLIENT-AUTHORITATIVE PATTERN 1 (RESULTS)
    // ========================================
    // Convert client messages to AgentResults
    let clientProvidedResults: AgentResult[] | undefined;
    if (messages.length > 0) {
      clientProvidedResults = convertMessagesToAgentResults(messages);
      console.log(`🔄 Converted ${messages.length} UI messages to ${clientProvidedResults.length} AgentResults`);
    }

    // Create simple agent
    const simpleAgent = createAgent<NetworkState>({
      name: "simple_agent",
      description: "A helpful assistant that can answer questions and engage in conversation",
      system: `You are a helpful assistant that can answer questions and engage in conversation.

When responding:
1. Be clear and concise
2. Use markdown formatting when appropriate
3. If you don't know something, say so
4. Reference previous conversation context when relevant`,
      model: openai({
        model: "gpt-4o",
      }),
    });

    // Create network with results in state and a postgres history adapter
    const simpleNetwork = createNetwork<NetworkState>({
      name: "simple_network",
      agents: [simpleAgent],
      defaultModel: openai({
        model: "gpt-4o",
      }),
      defaultState: createState(
        {
          query,
          userId: actualUserId,
        },
        {
          threadId, // May be undefined - AgentKit will create via history.createThread
          results: clientProvidedResults, // Client-authoritative or undefined for database loading
        }
      ),
      history: new PostgresHistoryAdapter<NetworkState>(
        config.database
      ), // Let AgentKit handle all thread/history management
      router: async ({ network, callCount }) => {
        // Simple router: run the agent once, then extract and publish response
        if (callCount === 0) {
          return simpleAgent;
        }

        // Agent has completed - extract response
        const lastResult = network.state.results[network.state.results.length - 1];
        
        if (lastResult && lastResult.output.length > 0) {
          const lastMessage = lastResult.output.find(
            (msg: Message) => msg.type === "text"
          ) as TextMessage;

          if (lastMessage?.type === "text") {            
            await publish({
              channel: `chat.${streamId}`,
              topic: "messages",
              data: {
                message: lastMessage,
                threadId: network.state.threadId,
              },
            });
          }
        }

        return undefined; // Stop the network
      },
      maxIter: 1,
    });

    // Run the network
    const response = await simpleNetwork.run(query)

    // Publish completion event
    await publish({
      channel: `chat.${streamId}`,
      topic: "messages",
      data: {
        status: "complete",
        threadId: response.state.threadId,
      },
    });

    // Return network response and thread ID
    return {
      response: extractResponseContent(response),
      threadId: response.state.threadId,
    };
  }
);

// Helper to extract response content from network result
function extractResponseContent(networkResponse: any): string | undefined {
  const lastResult = networkResponse.state.results[networkResponse.state.results.length - 1];
  
  if (lastResult && lastResult.output.length > 0) {
    const lastMessage = lastResult.output.find(
      (msg: Message) => msg.type === "text"
    ) as TextMessage;

    if (lastMessage?.type === "text") {
      return typeof lastMessage.content === "string"
        ? lastMessage.content
        : lastMessage.content[0]?.text;
    }
  }
  
  return undefined;
}
