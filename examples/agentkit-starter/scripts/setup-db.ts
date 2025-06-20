#!/usr/bin/env tsx

import { PostgresHistoryAdapter } from "../inngest/db";
import { config } from "../inngest/config";

async function setupDatabase() {
  console.log("🚀 Setting up AgentKit Chat Database...");
  console.log(`📍 Connection: ${config.database.connectionString}`);

  try {
    // Initialize the history adapter
    const historyAdapter = new PostgresHistoryAdapter(config.database);

    // Initialize tables
    await historyAdapter.initializeTables();

    console.log("✅ Database setup completed successfully!");
    console.log("\nTables created:");
    console.log(
      `  - ${config.database.schema}.${config.database.tablePrefix}threads`
    );
    console.log(
      `  - ${config.database.schema}.${config.database.tablePrefix}messages`
    );

    // Close the connection
    await historyAdapter.close();

    console.log("\n🎉 Ready to test AgentKit's full history system!");
    console.log("\nNext steps:");
    console.log("1. Start your development server: pnpm dev");
    console.log("2. Open your chat application");
    console.log("3. Start a conversation to test:");
    console.log("   - createThread: Creates new conversation threads");
    console.log("   - history.get: Loads conversation history from database");
    console.log("   - appendResults: Saves new messages to database");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    process.exit(1);
  }
}

// Run the setup
setupDatabase();
