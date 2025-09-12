import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { userChannel } from "@/lib/realtime";

// Typed request body for this endpoint
export type RequestBody = {
  userId?: string;
  channelKey?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const { userId: requestUserId, channelKey } = body;
        
    // TODO: Add authentication, authorization and input validation here
    
    // Channel key resolution: prioritize channelKey, fallback to userId
    const subscriptionChannelKey = channelKey || requestUserId;
    
    // Validate that we have a valid subscription key
    if (!subscriptionChannelKey) {
      return NextResponse.json(
        { error: "userId or channelKey is required" },
        { status: 400 }
      );
    }
    
    // Create a subscription token for the resolved channel
    const token = await getSubscriptionToken(inngest, {
      channel: userChannel(subscriptionChannelKey), // Subscribe to the resolved channel
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