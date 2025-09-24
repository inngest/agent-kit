import { NextRequest, NextResponse } from "next/server";
import { PostgresHistoryAdapter } from "@/inngest/db";
import type { CustomerSupportState } from "@/inngest/types/state";

// Create a shared adapter instance
const historyAdapter = new PostgresHistoryAdapter<CustomerSupportState>({});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;

    if (!threadId) {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 }
      );
    }

    // Get thread metadata
    const threadMetadata = await historyAdapter.getThreadMetadata(threadId);
    if (!threadMetadata) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get complete conversation history
    const messages = await historyAdapter.getCompleteHistory(threadId);

    // Extract title from metadata or generate from first message
    const metadataTitle = threadMetadata.metadata?.title;
    let title = metadataTitle;
    if (!title) {
      title = await historyAdapter.generateThreadTitle(threadId);
      if (title !== "New conversation") {
        // Save the generated title back to metadata
        await historyAdapter.updateThreadTitle(threadId, title);
      }
    }

    const thread = {
      id: threadId,
      title,
      messageCount: messages.length,
      createdAt: threadMetadata.created_at,
      updatedAt: threadMetadata.updated_at,
    };

    return NextResponse.json({
      thread,
      messages,
    });
  } catch (error) {
    console.error("Error getting thread:", error);
    return NextResponse.json(
      { error: "Failed to get thread" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;

    if (!threadId) {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 }
      );
    }

    await historyAdapter.deleteThread(threadId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting thread:", error);
    return NextResponse.json(
      { error: "Failed to delete thread" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const { title } = await req.json();

    if (!threadId) {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    await historyAdapter.updateThreadTitle(threadId, title);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating thread:", error);
    return NextResponse.json(
      { error: "Failed to update thread" },
      { status: 500 }
    );
  }
}
