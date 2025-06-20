#!/usr/bin/env tsx

import { PostgresHistoryAdapter } from "../inngest/db";
import { config } from "../inngest/config";

async function debugDatabase() {
  const adapter = new PostgresHistoryAdapter(config.database);

  try {
    console.log("🔍 AgentKit Database Debug Report");
    console.log("================================\n");

    // 1. Check threads
    console.log("📋 THREADS:");
    const threads = await adapter.listThreads(config.defaultUserId, 10);
    console.log(
      `Found ${threads.length} threads for user ${config.defaultUserId}`
    );

    if (threads.length === 0) {
      console.log("❌ No threads found. Create a conversation first.\n");
      return;
    }

    threads.forEach((thread, i) => {
      console.log(`  ${i + 1}. Thread: ${thread.thread_id}`);
      console.log(`     Created: ${thread.created_at}`);
      console.log(`     Updated: ${thread.updated_at}`);
      console.log(`     Metadata: ${JSON.stringify(thread.metadata, null, 2)}`);
    });

    // 2. Check complete conversation history for the most recent thread
    const latestThread = threads[0];
    console.log(
      `\n💬 COMPLETE CONVERSATION HISTORY (Thread: ${latestThread.thread_id}):`
    );

    const history = await adapter.getCompleteHistory(latestThread.thread_id);
    console.log(`Found ${history.length} total messages (user + agent)`);

    if (history.length === 0) {
      console.log("❌ No messages found in this thread.\n");
      return;
    }

    history.forEach((msg, i) => {
      console.log(`\n  ${i + 1}. ${msg.type.toUpperCase()} MESSAGE:`);
      console.log(`     Created: ${msg.createdAt}`);

      if (msg.type === "user") {
        console.log(`     Content: "${msg.content}"`);
      } else if (msg.type === "agent") {
        console.log(`     Agent: ${msg.agentName}`);
        console.log(`     Checksum: ${msg.data.checksum}`);
        console.log(`     Output Messages: ${msg.data.output?.length || 0}`);
        console.log(`     Tool Calls: ${msg.data.toolCalls?.length || 0}`);

        // Show first text message content if available
        const textMessage = msg.data.output?.find(
          (o: any) => o.type === "text"
        );
        if (textMessage) {
          const content =
            typeof textMessage.content === "string"
              ? textMessage.content
              : textMessage.content?.[0]?.text || "No content";
          console.log(
            `     Content Preview: "${content.substring(0, 100)}${
              content.length > 100 ? "..." : ""
            }"`
          );
        }
      }
    });

    // 3. Summary
    const userMessages = history.filter((m) => m.type === "user").length;
    const agentMessages = history.filter((m) => m.type === "agent").length;

    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total Threads: ${threads.length}`);
    console.log(`   Total Messages: ${history.length}`);
    console.log(`   User Messages: ${userMessages}`);
    console.log(`   Agent Messages: ${agentMessages}`);
    console.log(`   Latest Thread: ${latestThread.thread_id}`);
  } catch (error) {
    console.error("❌ Database debug failed:", error);
  } finally {
    await adapter.close();
  }
}

debugDatabase().catch(console.error);
