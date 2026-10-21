import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";

import { inngest } from "../../inngest/client";
import { userChannel } from "../../inngest/realtime";

export async function POST(req: NextRequest) {
  // TODO: authenticate the user before handing out a token for their channel.
  const { userId, channelKey } = (await req.json()) as {
    userId?: string;
    channelKey?: string;
  };
  const key = channelKey || userId;
  if (!key) {
    return NextResponse.json(
      { error: "userId or channelKey is required" },
      { status: 400 }
    );
  }

  const token = await getSubscriptionToken(inngest, {
    channel: userChannel(key),
    topics: ["agent_stream"],
  });
  return NextResponse.json(token);
}
