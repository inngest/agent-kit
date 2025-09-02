import { NextRequest, NextResponse } from "next/server";
import { PostgresHistoryAdapter } from "@/inngest/db";
import { randomUUID } from "crypto";
import type { CustomerSupportState } from "@/inngest/types/state";

// Create a shared adapter instance
const historyAdapter = new PostgresHistoryAdapter<CustomerSupportState>({});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    const userId = searchParams.get("userId");
    const channelKey = searchParams.get("channelKey");

    // Channel-first validation: require either userId OR channelKey
    if (!userId && !channelKey) {
      return NextResponse.json(
        { error: "Either userId or channelKey is required" },
        { status: 400 }
      );
    }
    
    // For anonymous sessions, use channelKey as userId for data queries
    const effectiveUserId = userId || channelKey!; // Non-null assertion safe due to validation above

    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: "Offset must be non-negative" },
        { status: 400 }
      );
    }

    const result = await historyAdapter.listThreadsWithPagination(effectiveUserId, limit, offset);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error listing threads:", error);
    return NextResponse.json(
      { error: "Failed to list threads" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, channelKey } = await req.json();

    // Channel-first validation: require either userId OR channelKey
    if (!userId && !channelKey) {
      return NextResponse.json(
        { error: "Either userId or channelKey is required" },
        { status: 400 }
      );
    }
    
    // For anonymous sessions, use channelKey as userId for data ownership
    const effectiveUserId = userId || channelKey!; // Non-null assertion safe due to validation above

    // Generate a new thread ID optimistically
    const threadId = randomUUID();

    // TODO: could we pass in a title from the request?
    return NextResponse.json({
      threadId,
      title: "New conversation", // Optimistic title
      userId: effectiveUserId, // Return the effective userId (supports anonymous)
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error creating thread:", error);
    return NextResponse.json(
      { error: "Failed to create thread" },
      { status: 500 }
    );
  }
}




