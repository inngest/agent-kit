import { NextRequest, NextResponse } from "next/server";
import { inngest } from "../../../inngest/client";
import { z } from "zod";

// Zod schema for request body validation
const approveToolRequestSchema = z.object({
  toolCallId: z.string().min(1, "Tool call ID is required"),
  threadId: z.string().uuid("Valid thread ID is required"),
  action: z.enum(["approve", "deny"], {
    errorMap: () => ({ message: "Action must be 'approve' or 'deny'" }),
  }),
  reason: z.string().optional(),
  userId: z.string().min(1, "User ID is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate request body with Zod
    const validationResult = approveToolRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }
    
    const { toolCallId, threadId, action, reason, userId } = validationResult.data;
    
    // Publish hitl.resolved event for the agent network to handle
    // This is a best-effort event publication - the actual approval logic
    // will be implemented in future Inngest functions that consume this event
    await inngest.send({
      name: "agent/hitl.resolved",
      data: {
        requestId: toolCallId, // Using toolCallId as requestId for now
        toolCallId,
        threadId,
        resolution: action === "approve" ? "approved" : "denied",
        reason: reason || `Tool ${action}d by user`,
        resolvedBy: userId,
        resolvedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      },
    });
    
    return NextResponse.json(
      { success: true, message: `Tool call ${action}d successfully` },
      { status: 204 }
    );
  } catch (error) {
    console.error("Error processing tool approval:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process tool approval" },
      { status: 500 }
    );
  }
}
