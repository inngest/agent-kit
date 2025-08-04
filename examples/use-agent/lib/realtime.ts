import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

// Hierarchical event schema as per specification
export const AgentMessageChunkSchema = z.object({
  event: z.string(), // Event name (e.g., "run.started", "part.created")
  data: z.record(z.any()), // Event-specific data
  timestamp: z.number(), // When the event occurred
  sequenceNumber: z.number(), // For ordering events
});

export type AgentMessageChunk = z.infer<typeof AgentMessageChunkSchema>;

// Create a channel for each conversation
export const conversationChannel = channel((conversationId: string) => `conversation:${conversationId}`)
  // Add the main stream topic for agent events
  .addTopic(
    topic("agent_stream").schema(AgentMessageChunkSchema)
  );

// Helper to get typed channel for subscribing
export const getConversationChannel = (conversationId: string) => conversationChannel(conversationId); 