import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { randomUUID } from "crypto";
import { z } from "zod";

// Zod schema for UserMessage
const userMessageSchema = z.object({
  id: z.string().uuid("Valid message ID is required"),
  content: z.string().min(1, "Message content is required"),
  role: z.literal("user"),
  state: z.record(z.unknown()).optional(),
  clientTimestamp: z.coerce.date().optional(), // ✅ Coerce string to Date object
  systemPrompt: z.string().optional(),
});

// Zod schema for request body validation
const chatRequestSchema = z.object({
  userMessage: userMessageSchema,
  threadId: z.string().uuid().optional(),
  userId: z.string().optional(),
  channelKey: z.string().optional(), // NEW: Support channelKey for flexible subscriptions
  history: z.array(z.any()).optional(), // TODO: define a more specific schema for history items
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate request body with Zod
    const validationResult = chatRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }
    
    const { userMessage, threadId: providedThreadId, userId, channelKey, history } = validationResult.data;
    
    // Channel-first validation: require either userId OR channelKey
    if (!userId && !channelKey) {
      return NextResponse.json(
        { error: "Either userId or channelKey is required" },
        { status: 400 }
      );
    }
    
    // For anonymous sessions, use channelKey as userId for data ownership
    const effectiveUserId = userId || channelKey!; // Non-null assertion safe due to validation above
    
    // If the client didn't provide a threadId, omit generation here.
    // AgentKit will create one during initializeThread; the canonical ID will
    // be returned in the response from this route.
    const threadId = providedThreadId || undefined;
    
    // Send event to Inngest to trigger the agent chat
    await inngest.send({
      name: "agent/chat.requested",
      data: {
        threadId: threadId ?? undefined,
        history,
        userMessage,
        userId: effectiveUserId, // For data ownership (userId or channelKey for anonymous)
        channelKey, // For flexible subscriptions (optional)
      },
    });
    
    return NextResponse.json({
      success: true,
      threadId: threadId, // May be undefined; client should use response threadId if provided by later enhancements
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start chat" },
      { status: 500 }
    );
  }
} 