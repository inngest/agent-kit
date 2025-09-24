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
    const offsetParam = searchParams.get("offset");
    const cursorTimestamp = searchParams.get("cursorTimestamp");
    const cursorId = searchParams.get("cursorId");
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

    if (cursorTimestamp && cursorId) {
      // Cursor-based pagination (preferred)
      const cursorTs = new Date(cursorTimestamp);

      // Keyset pagination using last_message_at (fallback to created_at) and thread_id as tiebreaker
      const client = await (historyAdapter as any).pool.connect();
      try {
        const threadsResult = await client.query(
          `
          WITH thread_stats AS (
            SELECT 
              t.thread_id,
              t.metadata,
              t.created_at,
              t.updated_at,
              COALESCE(MAX(m.created_at), t.created_at) AS last_message_at,
              COUNT(m.message_id) as message_count
            FROM ${historyAdapter.tableNames.threads} t
            LEFT JOIN ${historyAdapter.tableNames.messages} m ON t.thread_id = m.thread_id
            WHERE t.user_id = $1
            GROUP BY t.thread_id, t.metadata, t.created_at, t.updated_at
          )
          SELECT * FROM thread_stats
          WHERE (last_message_at, thread_id) < ($2, $3)
          ORDER BY last_message_at DESC, thread_id DESC
          LIMIT $4
          `,
          [effectiveUserId, cursorTs, cursorId, limit]
        );

        const threads = threadsResult.rows.map((row: any) => ({
          id: row.thread_id,
          title: (historyAdapter as any).extractTitleFromMetadata?.(row.metadata) || "New conversation",
          messageCount: parseInt(row.message_count),
          lastMessageAt: row.last_message_at || row.created_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        const hasMore = threads.length === limit;
        const last = threads[threads.length - 1];
        const nextCursorTimestamp = hasMore ? new Date(last!.lastMessageAt).toISOString() : null;
        const nextCursorId = hasMore ? last!.id : null;

        return NextResponse.json({ threads, hasMore, total: 0, nextCursorTimestamp, nextCursorId });
      } finally {
        client.release();
      }
    } else {
      // Legacy offset path
      const offset = parseInt(offsetParam || '0');
      if (offset < 0) {
        return NextResponse.json(
          { error: "Offset must be non-negative" },
          { status: 400 }
        );
      }
      const result = await historyAdapter.listThreadsWithPagination(effectiveUserId, limit, offset);
      return NextResponse.json(result);
    }
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




