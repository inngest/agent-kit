import { PostgresHistoryAdapter } from "@/inngest/db";
import { config } from "@/inngest/config";

export async function DELETE(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const { threadId } = params;

    if (!threadId) {
      return Response.json({ error: "Thread ID is required" }, { status: 400 });
    }

    const adapter = new PostgresHistoryAdapter(config.database);

    // Delete the thread (this will cascade delete messages due to foreign key constraint)
    await adapter.deleteThread(threadId);

    await adapter.close();

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete thread:", error);
    return Response.json({ error: "Failed to delete thread" }, { status: 500 });
  }
}
