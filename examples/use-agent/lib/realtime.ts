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

// Create a channel for each conversation (legacy - kept for backward compatibility)
export const conversationChannel = channel((conversationId: string) => `conversation:${conversationId}`)
  // Add the main stream topic for agent events
  .addTopic(
    topic("agent_stream").schema(AgentMessageChunkSchema)
  );

// NEW: Create a unified channel for each user (all their threads)
export const userChannel = channel((userId: string) => `user:${userId}`)
  // Add the main stream topic for agent events from all user's threads
  .addTopic(
    topic("agent_stream").schema(AgentMessageChunkSchema)
  );

// Helper to get typed channel for subscribing
export const getConversationChannel = (conversationId: string) => conversationChannel(conversationId);
export const getUserChannel = (userId: string) => userChannel(userId); 