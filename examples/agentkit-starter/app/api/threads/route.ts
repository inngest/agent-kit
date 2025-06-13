import { PostgresHistoryAdapter } from "@/inngest/db";
import { config } from "@/inngest/config";

export async function GET() {
  try {
    const adapter = new PostgresHistoryAdapter(config.database);

    // Get threads for the default user (in a real app, this would come from auth)
    const threads = await adapter.listThreads(config.defaultUserId, 50);

    await adapter.close();

    return Response.json({
      threads,
      count: threads.length,
    });
  } catch (error) {
    console.error("Failed to fetch threads:", error);
    return Response.json({ error: "Failed to fetch threads" }, { status: 500 });
  }
}
