import { inngest } from "@/inngest/client";
import { subscribe } from "@inngest/realtime";
import { type Message } from "@inngest/agent-kit";

// Allow responses up to 5 minutes
export const maxDuration = 300;

interface ChatRequest {
  query: string;
  threadId?: string; // Optional - AgentKit will create if not provided (for persistence)
  userId?: string; // Optional - will use default if not provided
  messages?: Message[]; // Optional - simple message objects for conversation history
  streamId: string; // Required - unique identifier for this request's real-time stream
}

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequest;
  const { query, threadId, userId, messages = [], streamId } = body;

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

  if (!streamId) {
    return new Response(
      JSON.stringify({ error: "Missing required field: streamId" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  // Testing: Using simple-agent-2 to test messages-based client-authoritative mode
  // Instead of converting messages to AgentResults, we pass them directly to createState
  try {
    await inngest.send({
      name: "simple-agent-2/run",
      data: {
        query,
        threadId, // May be undefined - AgentKit will handle persistence
        userId,
        messages, // Simple Message objects instead of AgentResults
        streamId, // Single channel for all real-time communication
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

  // Simple subscription: always use the streamId provided by client
  // - streamId: Ephemeral channel for this request/response cycle
  // - threadId: Persistent conversation identifier (database)
  const stream = await subscribe({
    app: inngest,
    channel: `chat.${streamId}`,
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
