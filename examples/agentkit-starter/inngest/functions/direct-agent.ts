import { createAgent, openai, TextMessage } from "@inngest/agent-kit";
import { inngest } from "../client";

// Create the Inngest function that runs an agent directly
export const directAgentFunction = inngest.createFunction(
  { id: "direct-agent-example" },
  { event: "direct-agent/run" },
  async ({ step, event }) => {
    const { query } = event.data;

    // Create a simple agent
    const agent = createAgent({
      name: "direct_agent",
      description: "A direct agent that responds without a network",
      system: `You are a helpful AI assistant. You provide clear, concise, and accurate responses.

Key guidelines:
- Be direct and to the point
- Use markdown formatting when helpful
- If you're unsure about something, say so`,
      model: openai({
        model: "gpt-4o",
      }),
    });

    // Run the agent directly with the query
    const result = await step.run("agent-inference", async () => {
      const agentResult = await agent.run(query, {
        maxIter: 5,
      });

      // Extract the response from the agent result
      const assistantMessage = agentResult.output.find(
        (msg) => msg.type === "text" && msg.role === "assistant"
      ) as TextMessage | undefined;

      // Export the agent result for serialization
      return {
        message: assistantMessage,
        agentResult: agentResult.export(),
        output: agentResult.output,
      };
    });

    // Prepare the response
    const response = {
      message: result.message,
      agentResult: result.agentResult,
    };

    return response;
  }
);
