import {
  createNetwork,
  createAgent,
  openai,
  createState,
  TextMessage,
  Message,
  AgentResult,
} from "@inngest/agent-kit";
import { inngest } from "../client";

// Define the network state interface
interface NetworkState {
  query: string | undefined;
  networkComplete: boolean;
  response?: string;
  threadId?: string;
}

// Helper function to extract messages from AgentResult objects for conversation history
function extractMessagesFromAgentResults(agentResults: any[]): Message[] {
  const messages: Message[] = [];

  for (const result of agentResults) {
    if (result.output && Array.isArray(result.output)) {
      // Add all output messages from each result
      messages.push(...result.output);
    }
  }

  return messages;
}

// Create the Inngest function
export const simpleAgentFunction = inngest.createFunction(
  { id: "simple-agent-workflow" },
  { event: "simple-agent/run" },
  async ({ step, event, publish }) => {
    const { query, threadId, agentResults = [] } = event.data;

    // Extract conversation history as messages
    const conversationHistory = extractMessagesFromAgentResults(agentResults);

    // Create a simple agent that can respond to queries
    const simpleAgent = createAgent<NetworkState>({
      name: "simple_agent",
      description: "A simple agent that can respond to general queries",
      system: `You are a helpful assistant that can answer questions and engage in conversation.
  
When responding:
1. Be clear and concise
2. Use markdown formatting when appropriate
3. If you don't know something, say so

You have access to the full conversation history. Use this context to provide relevant and contextual responses.`,
      model: openai({
        model: "gpt-4o",
      }),
    });

    // Create properly typed state for this run using messages for conversation history
    const state = createState<NetworkState>(
      {
        query,
        networkComplete: false,
        threadId,
      },
      {
        messages: conversationHistory, // Use messages instead of results for conversation history
      }
    );

    // Track if we've published the response yet
    let hasPublishedResponse = false;

    // Create the network
    const simpleNetwork = createNetwork<NetworkState>({
      name: "simple_network",
      agents: [simpleAgent],
      defaultModel: openai({
        model: "gpt-4o",
      }),
      defaultState: state,
      router: async ({ network }) => {
        const state = network.state.data;

        // If network is complete, stop
        if (state.networkComplete) {
          return undefined;
        }

        // Check if we have a new result to publish
        if (network.state.results.length > 0 && !hasPublishedResponse) {
          const lastResult =
            network.state.results[network.state.results.length - 1];

          const lastMessage = lastResult.output.find(
            (msg) => msg.type === "text"
          ) as TextMessage;

          if (lastMessage?.type === "text") {
            // Store the response in state
            state.response =
              typeof lastMessage.content === "string"
                ? lastMessage.content
                : lastMessage.content[0].text;
            state.networkComplete = true;
            hasPublishedResponse = true;

            // Publish the assistant message as a separate event for UI display
            await publish({
              channel: `chat.${state.threadId}`,
              topic: "messages",
              data: {
                message: lastMessage,
              },
            });
          }
        }

        // Default to the simple agent if we haven't completed yet
        return state.networkComplete ? undefined : simpleAgent;
      },
      maxIter: 2, // Reduce maxIter to prevent infinite loops
    });

    // Run the network with the query
    const response = await simpleNetwork.run(query, { state });

    // Get only the new results from this network run
    const newResults = response.state.results.map((result) => result.export());

    // Send completion event with only new agentResults
    await publish({
      channel: `chat.${threadId}`,
      topic: "messages",
      data: {
        status: "complete",
        agentResults: newResults, // Include only new results
      },
    });

    // Return only the new results
    return {
      response: response.state.data.response,
      agentResults: newResults, // Return only new results
    };
  }
);
