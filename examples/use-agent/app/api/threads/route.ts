import { NextRequest, NextResponse } from "next/server";
import { PostgresHistoryAdapter } from "@/inngest/db";
import { TEST_USER_ID } from "@/lib/constants";
import { randomUUID } from "crypto";
import type { CustomerSupportState } from "@/inngest/types/state";

// Create a shared adapter instance
const historyAdapter = new PostgresHistoryAdapter<CustomerSupportState>({});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    const userId = searchParams.get("userId") || TEST_USER_ID;

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

    const result = await historyAdapter.listThreadsWithPagination(userId, limit, offset);

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
    const { userId } = await req.json();
    const effectiveUserId = userId || TEST_USER_ID;

    // Generate a new thread ID optimistically
    const threadId = randomUUID();

    // TODO: could we pass in a title from the request?
    return NextResponse.json({
      threadId,
      title: "New conversation", // Optimistic title
      userId: effectiveUserId,
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




