import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { userChannel } from "@/lib/realtime";
import { TEST_USER_ID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const { userId: requestUserId = TEST_USER_ID } = await req.json();
        
    // TODO: Add authentication, authorization and input validation here
    
    // Create a subscription token for the user channel
    const token = await getSubscriptionToken(inngest, {
      channel: userChannel(requestUserId), // Subscribe to ALL user's threads
      topics: ["agent_stream"], // Subscribe to the agent_stream topic
    });
    
    return NextResponse.json(token);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create subscription token" },
      { status: 500 }
    );
  }
} 