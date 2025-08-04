import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { message, threadId: providedThreadId, customerId, history } = await req.json();
    
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }
    
    // Generate thread ID if not provided
    const threadId = providedThreadId || randomUUID();
    
    // Send event to Inngest to trigger the agent chat
    await inngest.send({
      name: "agent/chat.requested",
      data: {
        threadId,
        message,
        history,
        customerId: customerId || "anonymous",
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