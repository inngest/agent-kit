import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { conversationChannel } from "@/lib/realtime";

export async function POST(req: NextRequest) {
  try {
    const { threadId } = await req.json();
    
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 }
      );
    }
    
    // TODO: Add authentication/authorization here
    // Verify that the user has access to this thread
    
    // Create a subscription token for the conversation channel
    const token = await getSubscriptionToken(inngest, {
      channel: conversationChannel(threadId),
      topics: ["agent_stream"], // Subscribe to the agent_stream topic
    });
    
    return NextResponse.json(token);
  } catch (error) {
    console.error("Error creating subscription token:", error);
    return NextResponse.json(
      { error: "Failed to create subscription token" },
      { status: 500 }
    );
  }
} 