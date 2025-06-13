#!/usr/bin/env tsx

import { config } from "../inngest/config";

const BASE_URL = "http://localhost:3000";

async function testAPI() {
  console.log("🧪 Testing AgentKit Chat API Endpoints");
  console.log("=====================================\n");

  try {
    // Test 1: List threads
    console.log("1. Testing GET /api/threads");
    const threadsResponse = await fetch(`${BASE_URL}/api/threads`);
    const threadsData = await threadsResponse.json();

    if (threadsResponse.ok) {
      console.log(`✅ Found ${threadsData.count} threads`);
      threadsData.threads.forEach((thread: any, i: number) => {
        console.log(
          `   ${i + 1}. ${thread.thread_id} (${new Date(
            thread.updated_at
          ).toLocaleString()})`
        );
      });
    } else {
      console.log(`❌ Failed: ${threadsData.error}`);
    }

    if (threadsData.threads && threadsData.threads.length > 0) {
      const testThreadId = threadsData.threads[0].thread_id;

      // Test 2: Get thread history
      console.log(`\n2. Testing GET /api/threads/${testThreadId}/history`);
      const historyResponse = await fetch(
        `${BASE_URL}/api/threads/${testThreadId}/history`
      );
      const historyData = await historyResponse.json();

      if (historyResponse.ok) {
        console.log(
          `✅ Loaded thread history with ${historyData.messageCount} messages`
        );
        console.log(`   Thread: ${historyData.threadId}`);
        console.log(`   Metadata:`, historyData.metadata);
        historyData.history.forEach((msg: any, i: number) => {
          if (msg.type === "user") {
            console.log(
              `   ${i + 1}. USER: "${msg.content.substring(0, 50)}..."`
            );
          } else {
            console.log(
              `   ${i + 1}. AGENT: "${msg.data.output[0]?.content?.substring(
                0,
                50
              )}..."`
            );
          }
        });
      } else {
        console.log(`❌ Failed: ${historyData.error}`);
      }

      // Test 3: Delete thread (commented out to preserve data)
      console.log(
        `\n3. Testing DELETE /api/threads/${testThreadId} (SKIPPED - preserving data)`
      );
      console.log("   ⚠️  Uncomment in script to test deletion");

      /*
      console.log(`\n3. Testing DELETE /api/threads/${testThreadId}`);
      const deleteResponse = await fetch(`${BASE_URL}/api/threads/${testThreadId}`, {
        method: 'DELETE'
      });
      const deleteData = await deleteResponse.json();
      
      if (deleteResponse.ok) {
        console.log(`✅ Thread deleted successfully`);
      } else {
        console.log(`❌ Failed: ${deleteData.error}`);
      }
      */
    }
  } catch (error) {
    console.error("❌ API test failed:", error);
    console.log("\n💡 Make sure your development server is running:");
    console.log("   pnpm dev");
  }

  console.log("\n🎉 API testing completed!");
}

testAPI().catch(console.error);
