import { simpleAgentFunction } from "@/inngest/functions/simple-agent";
import { inngest } from "@/inngest/client";
import { subscribe } from "@inngest/realtime";

// Allow responses up to 5 minutes
export const maxDuration = 300;

interface ChatRequest {
  query: string;
  threadId?: string; // Optional - AgentKit will create if not provided
  userId?: string; // Optional - will use default if not provided
  agentResults?: any[]; // Optional - client-provided conversation history
}

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequest;
  const { query, threadId, userId, agentResults = [] } = body;

  if (!query) {
    return new Response(
      JSON.stringify({ error: "Missing required field: query" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  // For real-time subscription, we need a channel ID
  // If threadId provided, use it; otherwise use a temporary channel
  const channelId =
    threadId || `temp-${Date.now()}-${Math.random().toString(36).substring(2)}`;

  // AgentKit pattern: threadId is optional
  // - If provided: Use existing conversation
  // - If not provided: AgentKit calls history.createThread automatically
  try {
    await inngest.send({
      name: "simple-agent/run",
      data: {
        query,
        threadId, // May be undefined - AgentKit will handle
        userId,
        agentResults,
        tempChannelId: !threadId ? channelId : undefined, // Pass temp channel for new conversations
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to run agent" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  const stream = await subscribe({
    app: inngest,
    channel: `chat.${channelId}`,
    topics: ["messages"],
  });

  return new Response(stream.getEncodedStream(), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
