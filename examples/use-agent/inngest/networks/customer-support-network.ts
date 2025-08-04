import { createNetwork, openai } from "@inngest/agent-kit";
import type { State } from "@inngest/agent-kit";
import { triageAgent, billingAgent, technicalSupportAgent } from "../agents";
import { conversationChannel, type AgentMessageChunk } from "../../lib/realtime";
import type { CustomerSupportState } from "../types/state";
import crypto from "crypto";

// Type for the publish function from Inngest
type PublishFunction = (channel: any) => Promise<void>;

// Factory function to create a router with realtime publishing
export function createRealtimeRouter(publish: PublishFunction, step: any, threadId: string) {
  let networkRunId: string;
  let messageId: string;
  let sequenceNumber = 0;
  let currentAgentRunId: string;

  const publishEvent = (event: string, data: any) => {
    const chunk: AgentMessageChunk = {
      event,
      data,
      timestamp: Date.now(),
      sequenceNumber: sequenceNumber++,
    };
    
    console.log("[NETWORK] Publishing event:", {
      threadId,
      event,
      dataKeys: Object.keys(data),
      partId: data.partId || 'no-partId',
      sequenceNumber: chunk.sequenceNumber,
      timestamp: new Date().toISOString()
    });
    
    // Use step.run to ensure each publish is a unique step
    return step.run(`publish-event-${sequenceNumber}-${event}`, () => {
      return publish(
        conversationChannel(threadId).agent_stream(chunk)
      );
    });
  };

  return async ({ network, lastResult, callCount }: any) => {
    try {
      const state = network.state.data as CustomerSupportState;
      
      if (callCount === 0) {
      // Generate all initial IDs in a single step for consistency
      [networkRunId, messageId, currentAgentRunId] = await step.run("generate-initial-ids", () => {
        return [
          crypto.randomUUID(), // networkRunId
          crypto.randomUUID(), // messageId
          crypto.randomUUID(), // agentRunId for triage agent
        ];
      });
      
      // Start network
      await publishEvent("run.started", {
        runId: networkRunId,
        scope: "network",
        name: "Customer Support Network",
        messageId,
      });
      
      // Start first agent (triage)
      await publishEvent("run.started", {
        runId: currentAgentRunId,
        parentRunId: networkRunId,
        scope: "agent",
        name: triageAgent.name,
        messageId,
      });
      
      return triageAgent;
    }
    
    // Process results from the last agent
    if (lastResult) {
      const lastAgentName = lastResult.agentName;
      const lastMessage = lastResult.output[lastResult.output.length - 1];

      // Complete the previous agent's run
      await publishEvent("run.completed", {
        runId: currentAgentRunId, // Use the stored run ID
        scope: "agent",
        name: lastAgentName,
        messageId,
      });

      // Only stream user-facing responses, not internal triage responses
      const isTriageAgent = lastAgentName === triageAgent.name;
      const shouldStreamResponse = !isTriageAgent;

      console.log("[NETWORK] Processing agent result:", {
        agentName: lastAgentName,
        isTriageAgent,
        shouldStreamResponse,
        callCount,
        timestamp: new Date().toISOString()
      });

      // Create and stream the agent's response (only for user-facing agents)
      if (shouldStreamResponse && lastMessage?.type === "text" && typeof lastMessage.content === "string") {
        console.log("[NETWORK] About to call streamAgentResponse:", {
          agentName: lastAgentName,
          messageId,
          contentLength: lastMessage.content.length,
          callCount,
          timestamp: new Date().toISOString()
        });
        try {
          await streamAgentResponse(step, publishEvent, lastMessage.content, lastAgentName, messageId, currentAgentRunId);
        } catch (streamError) {
          await publishEvent("error", {
            error: streamError instanceof Error ? streamError.message : "Failed to stream agent response",
            errorType: streamError instanceof Error ? streamError.constructor.name : "StreamError",
            runId: currentAgentRunId,
            messageId,
            scope: "streaming",
            agentId: lastAgentName,
            recoverable: true,
          });
        }
      }

      // Handle tool calls (only for user-facing agents)
      if (shouldStreamResponse) {
        for (const toolCall of lastResult.toolCalls) {
          if (toolCall.type === "tool_result") {
            try {
              await streamToolCall(step, publishEvent, toolCall, lastAgentName, messageId, currentAgentRunId);
            } catch (streamError) {
              await publishEvent("error", {
                error: streamError instanceof Error ? streamError.message : "Failed to stream tool call",
                errorType: streamError instanceof Error ? streamError.constructor.name : "ToolStreamError",
                runId: currentAgentRunId,
                messageId,
                scope: "tool-streaming",
                agentId: lastAgentName,
                toolName: toolCall.tool?.name || "unknown",
                recoverable: true,
              });
            }
          }
        }
      }
    }
    
    // Routing logic after triage
    if (callCount === 1 && lastResult?.agentName === triageAgent.name) {
      const content = lastResult.output[0]?.type === "text" 
        ? lastResult.output[0].content 
        : "";
        
      if (typeof content === "string") {
        const lowerContent = content.toLowerCase();
        let nextAgent;
        let nextAgentName: string | undefined;

        if (lowerContent.includes("billing") || lowerContent.includes("payment") || lowerContent.includes("invoice")) {
          state.department = "billing";
          nextAgent = billingAgent;
          nextAgentName = billingAgent.name;
        } else if (lowerContent.includes("technical") || lowerContent.includes("bug") || lowerContent.includes("error")) {
          state.department = "technical";
          nextAgent = technicalSupportAgent;
          nextAgentName = technicalSupportAgent.name;
        }
        
        if (nextAgent && nextAgentName) {
          state.triageComplete = true;
          
          // Generate new run ID for the next agent and start it
          currentAgentRunId = await step.run(`generate-${state.department}-run-id`, () => crypto.randomUUID());
          await publishEvent("run.started", {
            runId: currentAgentRunId,
            parentRunId: networkRunId,
            scope: "agent",
            name: nextAgentName,
            messageId,
          });
          
          return nextAgent;
        }
      }
    }
    
    // Check for continuation
    if (state.triageComplete && state.department && callCount < 5) {
      const lastMessage = lastResult?.output[lastResult.output.length - 1];
      if (lastMessage?.type === "text" && typeof lastMessage.content === "string") {
        const content = lastMessage.content.toLowerCase();
        
        if (content.includes("let me") || content.includes("i'll check") || content.includes("checking")) {
          if (state.department === "billing") {
            return billingAgent;
          } else if (state.department === "technical") {
            return technicalSupportAgent;
          }
        }
      }
    }
    
      // Complete network
      await publishEvent("run.completed", {
        runId: networkRunId,
        scope: "network",
        name: "Customer Support Network",
        messageId,
      });
      
      await publishEvent("stream.ended", {});

      return undefined;
    } catch (error) {
      // Publish error event for router-level errors
      await publishEvent("error", {
        error: error instanceof Error ? error.message : "Router error occurred",
        errorType: error instanceof Error ? error.constructor.name : "Unknown",
        runId: networkRunId || `error-${Date.now()}`,
        messageId: messageId || `error-msg-${Date.now()}`,
        scope: "router",
        agentId: "router",
        recoverable: true,
      });
      
      // Complete network with error status
      await publishEvent("run.completed", {
        runId: networkRunId || `error-${Date.now()}`,
        scope: "network",
        name: "Customer Support Network",
        messageId: messageId || `error-msg-${Date.now()}`,
        error: true,
      });
      
      await publishEvent("stream.ended", {});
      
      // Re-throw to ensure the error bubbles up
      throw error;
    }
  };
}

// Helper function to stream agent response following the part lifecycle
async function streamAgentResponse(
  step: any,
  publishEvent: (event: string, data: any) => Promise<void>,
  text: string,
  agentName: string,
  messageId: string,
  agentRunId: string,
  threadId?: string
) {
  const partId = await step.run(`generate-text-part-id-for-${agentName}`, () => crypto.randomUUID());
  
  console.log("[NETWORK] streamAgentResponse starting:", {
    partId,
    agentName,
    messageId,
    agentRunId,
    threadId,
    textLength: text.length,
    textPreview: text.substring(0, 50) + "...",
    timestamp: new Date().toISOString()
  });
  
  // Create text part
  await publishEvent("part.created", {
    partId,
    runId: agentRunId,
    messageId,
    type: "text",
    metadata: {
      agentName,
    },
  });
  
  console.log("[NETWORK] part.created sent:", { partId, agentName });

  // Stream text in chunks
  const chunkSize = 20;
  for (let i = 0; i < text.length; i += chunkSize) {
    const delta = text.substring(i, i + chunkSize);
    console.log("[NETWORK] Sending text.delta:", {
      partId,
      agentName,
      deltaContent: delta,
      deltaIndex: Math.floor(i / chunkSize),
      timestamp: new Date().toISOString()
    });
    
    await publishEvent("text.delta", {
      partId,
      messageId, // Ensure the messageId is included for client-side lookup
      delta,
    });
    
    // Small delay to simulate typing
    await step.sleep(`typing-delay-${i}`, "50ms");
  }

  // Complete the text part
  console.log("[NETWORK] Sending part.completed:", {
    partId,
    agentName,
    agentRunId,
    textLength: text.length,
    timestamp: new Date().toISOString()
  });
  
  await publishEvent("part.completed", {
    partId,
    runId: agentRunId,
    messageId,
    type: "text",
    finalContent: text,
  });
}

// Helper function to stream tool calls
async function streamToolCall(
  step: any,
  publishEvent: (event: string, data: any) => Promise<void>,
  toolCall: any,
  agentName: string,
  messageId: string,
  agentRunId: string,
) {
  const toolCallPartId = await step.run(`generate-tool-part-id-for-${toolCall.tool.name}`, () => crypto.randomUUID());
  
  // Create tool call part
  await publishEvent("part.created", {
    partId: toolCallPartId,
    runId: agentRunId,
    messageId,
    type: "tool-call",
    metadata: {
      toolName: toolCall.tool.name,
      agentName,
    },
  });

  // Stream tool arguments
  const argsJson = JSON.stringify(toolCall.tool.input);
  const chunkSize = 10;
  for (let i = 0; i < argsJson.length; i += chunkSize) {
    const delta = argsJson.substring(i, i + chunkSize);
    await publishEvent("tool_call.arguments.delta", {
      partId: toolCallPartId,
      delta,
      toolName: i === 0 ? toolCall.tool.name : undefined,
    });
    await step.sleep(`tool-args-delay-${i}`, "30ms");
  }

  // Complete tool call arguments
  await publishEvent("part.completed", {
    partId: toolCallPartId,
    runId: agentRunId,
    messageId,
    type: "tool-call",
    finalContent: toolCall.tool.input,
  });

  // Stream tool output if available
  if (toolCall.result) {
    const outputPartId = await step.run(`generate-tool-output-part-id-for-${toolCall.tool.name}`, () => crypto.randomUUID());
    
    await publishEvent("part.created", {
      partId: outputPartId,
      runId: agentRunId,
      messageId,
      type: "tool-output",
      metadata: {
        toolName: toolCall.tool.name,
        agentName,
      },
    });

    const resultJson = JSON.stringify(toolCall.result);
    for (let i = 0; i < resultJson.length; i += chunkSize) {
      const delta = resultJson.substring(i, i + chunkSize);
      await publishEvent("tool_call.output.delta", {
        partId: outputPartId,
        delta,
      });
      await step.sleep(`tool-output-delay-${i}`, "30ms");
    }

    await publishEvent("part.completed", {
      partId: outputPartId,
      runId: agentRunId,
      messageId,
      type: "tool-output",
      finalContent: toolCall.result,
    });
  }
}

// Factory function to create the customer support network with runtime dependencies
export function createCustomerSupportNetwork(
  publish: PublishFunction,
  step: any, // Inngest step object
  threadId: string,
  initialState: State<CustomerSupportState>,
  historyAdapter?: any
) {
  console.log("[NETWORK] Creating network for thread:", {
    threadId,
    timestamp: new Date().toISOString()
  });
  
  return createNetwork<CustomerSupportState>({
    name: "Customer Support Network",
    description: "Handles customer support inquiries with specialized agents",
    agents: [triageAgent, billingAgent, technicalSupportAgent],
    defaultModel: openai({ model: "gpt-4o-mini" }),
    maxIter: 5,
    defaultState: initialState,
    router: createRealtimeRouter(publish, step, threadId),
    history: historyAdapter,
  });
}
