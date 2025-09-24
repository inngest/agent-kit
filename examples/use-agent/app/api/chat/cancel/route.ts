import { NextRequest, NextResponse } from "next/server";
import { inngest } from "../../../../inngest/client";
import { z } from "zod";

// Zod schema for request body validation
const cancelRequestSchema = z.object({
  threadId: z.string().uuid("Valid thread ID is required"),
  userId: z.string().min(1, "User ID is required"),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate request body with Zod
    const validationResult = cancelRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }
    
    const { threadId, userId, reason } = validationResult.data;
    
    // Publish run.interrupted event for the agent network to handle
    // This is a best-effort event publication - the actual cancellation logic
    // will be implemented in future Inngest functions that consume this event
    await inngest.send({
      name: "agent/run.interrupted",
      data: {
        threadId,
        userId,
        reason: reason || "user_cancellation",
        timestamp: new Date().toISOString(),
      },
    });
    
    return NextResponse.json(
      { success: true, message: "Cancellation request sent" },
      { status: 204 }
    );
  } catch (error) {
    console.error("Error canceling agent run:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel agent run" },
      { status: 500 }
    );
  }
}
