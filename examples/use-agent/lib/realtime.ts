import { channel, topic } from "@inngest/realtime";
import { AgentMessageChunkSchema } from "@inngest/agent-kit";

export const userChannel = channel((userId: string) => `user:${userId}`)
  .addTopic(
    topic("agent_stream").schema(AgentMessageChunkSchema)
  );