import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { randomUUID } from "crypto";
import { TEST_USER_ID } from "@/lib/constants";

// Basic UUID validation regex
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(req: NextRequest) {
  try {
    const { message, threadId: providedThreadId, userId, history, messageId } = await req.json();
    
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    
    // Validate the canonical message ID
    if (!messageId || typeof messageId !== "string" || !UUID_REGEX.test(messageId)) {
      return NextResponse.json({ error: "Valid messageId is required" }, { status: 400 });
    }
    
    // Generate thread ID if not provided
    const threadId = providedThreadId || randomUUID();
    
    // Send event to Inngest to trigger the agent chat
    await inngest.send({
      name: "agent/chat.requested",
      data: {
        threadId,
        message,
        messageId, // Pass the canonical ID to the Inngest event
        history,
        userId: userId || TEST_USER_ID,
      },
    });
    
    return NextResponse.json({
      success: true,
      threadId,
    });
  } catch (error) {
    console.error("Error triggering agent chat:", error);
    return NextResponse.json(
      { error: "Failed to start chat" },
      { status: 500 }
    );
  }
} 