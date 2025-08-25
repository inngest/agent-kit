import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { userChannel } from "@/lib/realtime";
import { TEST_USER_ID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const { userId, threadId } = await req.json();
    const effectiveUserId = userId || TEST_USER_ID;
    
    // Note: threadId is now optional - we subscribe to user channel, not thread channel
    console.log("Creating user-scoped subscription token:", { userId: effectiveUserId, threadId });
    
    // TODO: Add authentication/authorization here
    // Verify that the user is authenticated and authorized
    
    // Create a subscription token for the user channel (unified stream)
    const token = await getSubscriptionToken(inngest, {
      channel: userChannel(effectiveUserId), // Subscribe to ALL user's threads
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