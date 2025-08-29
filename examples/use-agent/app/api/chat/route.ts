import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { randomUUID } from "crypto";
import { z } from "zod";
import { TEST_USER_ID } from "@/lib/constants";

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
    
    const { userMessage, threadId: providedThreadId, userId, history } = validationResult.data;
    
    // Generate thread ID if not provided
    // TODO: doesn't agentkit generate and return one of these internally now? need to check on this...
    const threadId = providedThreadId || randomUUID();
    
    // Send event to Inngest to trigger the agent chat
    await inngest.send({
      name: "agent/chat.requested",
      data: {
        threadId,
        history,
        userMessage,
        userId: userId || TEST_USER_ID,
      },
    });
    
    return NextResponse.json({
      success: true,
      threadId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start chat" },
      { status: 500 }
    );
  }
} 