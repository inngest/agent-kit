import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { inngest } from "../inngest/client";

const chatRequestSchema = z.object({
  userMessage: z.object({
    id: z.string(),
    content: z.string().min(1),
    role: z.literal("user"),
  }),
  threadId: z.uuid(),
  history: z.array(z.any()).optional(),
  userId: z.string().optional(),
  channelKey: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const result = chatRequestSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  const { threadId, userId, channelKey } = result.data;
  if (!userId && !channelKey) {
    return NextResponse.json(
      { error: "userId or channelKey is required" },
      { status: 400 }
    );
  }

  await inngest.send({ name: "agent/chat.requested", data: result.data });
  return NextResponse.json({ success: true, threadId });
}
