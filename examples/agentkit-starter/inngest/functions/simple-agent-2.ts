import {
    createNetwork,
    createAgent,
    openai,
    createState,
    TextMessage,
    Message,
  } from "../agentkit-dist";
  import { inngest } from "../client";
  import { PostgresHistoryAdapter } from "../db";
  import { config } from "../config";
  
  // Define the network state interface
  interface NetworkState {
    query: string | undefined;
    userId: string;
  }
  
  // Initialize the PostgreSQL history adapter
  const historyAdapter = new PostgresHistoryAdapter<NetworkState>(
    config.database
  );
  
  // Create the Inngest function
  export const simpleAgentFunction2 = inngest.createFunction(
    { id: "simple-agent-workflow-2-messages" },
    { event: "simple-agent-2/run" },
    async ({ step, event, publish }) => {
      // ========================================
      // EXTRACT EVENT DATA
      // ========================================
      const {
        query,
        threadId,
        userId,
        messages = [], // Simple Message objects from client
        streamId, // Single channel for realtime events
      } = event.data;
     
      const actualUserId = userId || config.defaultUserId;
  
      // ========================================
      // CLIENT-AUTHORITATIVE PATTERN 2 (MESSAGES)
      // Pass client messages directly to createState instead of converting to AgentResults
      // This tests the new client-authoritative mode with messages
  
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
  
    
      const simpleNetwork = createNetwork<NetworkState>({
        name: "simple_network",
        agents: [simpleAgent],
        defaultModel: openai({
          model: "gpt-4o",
        }),
        // Testing: Messages-based client-authoritative mode
        // Instead of converting messages to AgentResults, we pass them directly
        // This should bypass history.get() just like results do
        defaultState: createState(
          {
            query,
            userId: actualUserId,
          },
          {
            threadId, // May be undefined - AgentKit will create via history.createThread
            messages: messages.length > 0 ? messages : undefined, // Client-authoritative messages mode
          }
        ),
        history: historyAdapter, // Let AgentKit handle all thread/history management
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

              // Publish the last message to the client
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
      const response = await simpleNetwork.run(query);
  
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
  