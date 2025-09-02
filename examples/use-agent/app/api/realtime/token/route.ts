import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { userChannel } from "@/lib/realtime";

export async function POST(req: NextRequest) {
  try {
    const { 
      userId: requestUserId, 
      channelKey 
    } = await req.json();
        
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