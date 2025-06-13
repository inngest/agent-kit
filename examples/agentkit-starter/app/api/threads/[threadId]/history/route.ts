import { PostgresHistoryAdapter } from "@/inngest/db";
import { config } from "@/inngest/config";

export async function GET(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const { threadId } = params;

    if (!threadId) {
      return Response.json({ error: "Thread ID is required" }, { status: 400 });
    }

    const adapter = new PostgresHistoryAdapter(config.database);

    // Get complete conversation history (both user and agent messages)
    const history = await adapter.getCompleteHistory(threadId);

    // Get thread metadata
    const threadMetadata = await adapter.getThreadMetadata(threadId);

    await adapter.close();

    if (!threadMetadata) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    return Response.json({
      threadId,
      metadata: threadMetadata,
      history,
      messageCount: history.length,
    });
  } catch (error) {
    console.error("Failed to fetch thread history:", error);
    return Response.json(
      { error: "Failed to fetch thread history" },
      { status: 500 }
    );
  }
}
