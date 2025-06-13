// using local build of agentkit
import {
  type HistoryConfig,
  type History,
  type StateData,
  AgentResult,
} from "./agentkit-dist";
import { Pool } from "pg";

// PostgreSQL History Configuration
export interface PostgresHistoryConfig {
  connectionString: string;
  tablePrefix?: string;
  schema?: string;
}

export class PostgresHistoryAdapter<T extends StateData>
  implements HistoryConfig<T>
{
  private pool: Pool;
  private tablePrefix: string;
  private schema: string;

  constructor(config: PostgresHistoryConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    this.tablePrefix = config.tablePrefix || "agentkit_";
    this.schema = config.schema || "public";
  }

  // Table names with proper schema and prefix
  get tableNames() {
    return {
      threads: `${this.schema}.${this.tablePrefix}threads`,
      messages: `${this.schema}.${this.tablePrefix}messages`,
    };
  }

  /**
   * Initialize database tables if they don't exist
   */
  async initializeTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Create threads table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableNames.threads} (
          thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create unified messages table that can store both user messages and agent results
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableNames.messages} (
          id SERIAL PRIMARY KEY,
          thread_id UUID NOT NULL REFERENCES ${this.tableNames.threads}(thread_id) ON DELETE CASCADE,
          message_type TEXT NOT NULL CHECK (message_type IN ('user', 'agent')),
          agent_name TEXT, -- NULL for user messages, agent name for agent results
          content TEXT, -- User message content (for user messages)
          data JSONB, -- Full AgentResult data (for agent results)
          checksum TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(thread_id, checksum)
        )
      `);

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_thread_id 
        ON ${this.tableNames.messages}(thread_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_created_at 
        ON ${this.tableNames.messages}(created_at)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_type 
        ON ${this.tableNames.messages}(message_type)
      `);

      await client.query("COMMIT");
      console.log("✅ PostgreSQL tables initialized successfully");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("❌ Failed to initialize PostgreSQL tables:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new conversation thread.
   */
  createThread = async (
    ctx: History.CreateThreadContext<T>
  ): Promise<{ threadId: string }> => {
    const client = await this.pool.connect();

    try {
      const operation = async () => {
        const result = await client.query(
          `
          INSERT INTO ${this.tableNames.threads} (user_id, metadata)
          VALUES ($1, $2)
          RETURNING thread_id
        `,
          [
            ctx.state.data.userId || null,
            JSON.stringify(ctx.state.data), // Persist initial state data
          ]
        );

        return result.rows[0].thread_id;
      };

      const threadId = ctx.step
        ? await ctx.step.run("create-thread", operation)
        : await operation();

      console.log(`🆕 Created new thread: ${threadId}`);
      return { threadId };
    } finally {
      client.release();
    }
  };

  /**
   * Load conversation history from storage.
   */
  get = async (ctx: History.Context<T>): Promise<AgentResult[]> => {
    if (!ctx.threadId) {
      console.log("⚠️ No threadId provided, returning empty history");
      return [];
    }

    const client = await this.pool.connect();

    try {
      const operation = async () => {
        // Only load agent results, not user messages (user messages are handled by the framework)
        const result = await client.query(
          `
          SELECT data FROM ${this.tableNames.messages}
          WHERE thread_id = $1 AND message_type = 'agent'
          ORDER BY created_at ASC
        `,
          [ctx.threadId]
        );

        // Deserialize AgentResult objects from JSONB
        return result.rows.map((row) => {
          const data = row.data;
          // Reconstruct the class instance to ensure methods like .checksum are available
          return new AgentResult(
            data.agentName,
            data.output,
            data.toolCalls,
            new Date(data.createdAt)
          );
        });
      };

      const results = ctx.step
        ? ((await ctx.step.run(
            "load-history",
            operation
          )) as unknown as AgentResult[])
        : await operation();

      console.log(
        `📚 Loaded ${results.length} agent messages for thread ${ctx.threadId}`
      );
      return results;
    } finally {
      client.release();
    }
  };

  /**
   * Save new conversation results to storage.
   */
  appendResults = async ({
    threadId,
    newResults,
    userMessage,
    step,
  }: History.Context<T> & {
    newResults: AgentResult[];
    userMessage?: {
      content: string;
      role: "user";
      timestamp: Date;
    };
  }): Promise<void> => {
    console.log("🔍 appendResults called with detailed params:");
    console.log("  - threadId:", threadId, "(type:", typeof threadId, ")");
    console.log(
      "  - newResults:",
      newResults,
      "(length:",
      newResults?.length || 0,
      ")"
    );
    console.log("  - userMessage:", userMessage ? "provided" : "not provided");
    console.log("  - step:", !!step);

    if (!threadId) {
      console.log("⚠️ No threadId provided, skipping save");
      return;
    }

    if (!newResults?.length && !userMessage) {
      console.log("⚠️ No newResults or userMessage provided, skipping save");
      return;
    }

    const client = await this.pool.connect();

    try {
      const operation = async () => {
        console.log("🔄 Starting database transaction...");
        await client.query("BEGIN");

        try {
          // Update thread's updated_at timestamp
          console.log("📝 Updating thread timestamp...");
          await client.query(
            `
            UPDATE ${this.tableNames.threads}
            SET updated_at = NOW()
            WHERE thread_id = $1
          `,
            [threadId]
          );

          // Insert user message if provided
          if (userMessage) {
            console.log("👤 Inserting user message...");
            const userChecksum = `user_${userMessage.timestamp.getTime()}_${userMessage.content.substring(
              0,
              50
            )}`;

            await client.query(
              `
              INSERT INTO ${this.tableNames.messages} (thread_id, message_type, content, checksum, created_at)
              VALUES ($1, 'user', $2, $3, $4)
              ON CONFLICT (thread_id, checksum) DO NOTHING
            `,
              [
                threadId,
                userMessage.content,
                userChecksum,
                userMessage.timestamp,
              ]
            );
            console.log("✅ User message inserted successfully");
          }

          // Insert agent results
          if (newResults?.length > 0) {
            console.log("🤖 Inserting agent messages...");
            for (const result of newResults) {
              console.log(
                `  - Inserting message from ${result.agentName} (checksum: ${result.checksum})`
              );
              const exportedData = result.export();

              await client.query(
                `
                INSERT INTO ${this.tableNames.messages} (thread_id, message_type, agent_name, data, checksum)
                VALUES ($1, 'agent', $2, $3, $4)
                ON CONFLICT (thread_id, checksum) DO NOTHING
              `,
                [threadId, result.agentName, exportedData, result.checksum]
              );
              console.log(`  ✅ Agent message inserted successfully`);
            }
          }

          await client.query("COMMIT");
          console.log("✅ Transaction committed successfully");

          const totalSaved = (userMessage ? 1 : 0) + (newResults?.length || 0);
          console.log(
            `💾 Saved ${totalSaved} messages to thread ${threadId} (${
              userMessage ? "1 user + " : ""
            }${newResults?.length || 0} agent)`
          );
        } catch (error) {
          console.error("❌ Error during transaction:", error);
          await client.query("ROLLBACK");
          throw error;
        }
      };

      step ? await step.run("save-results", operation) : await operation();
    } catch (error) {
      console.error("❌ appendResults failed:", error);
      throw error;
    } finally {
      client.release();
    }
  };

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    console.log("🔌 PostgreSQL connection pool closed");
  }

  /**
   * Get thread metadata
   */
  async getThreadMetadata(threadId: string): Promise<any> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT metadata, created_at, updated_at FROM ${this.tableNames.threads} WHERE thread_id = $1`,
        [threadId]
      );

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * List all threads for a user
   */
  async listThreads(userId: string, limit: number = 50): Promise<any[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT thread_id, metadata, created_at, updated_at 
        FROM ${this.tableNames.threads} 
        WHERE user_id = $1 
        ORDER BY updated_at DESC 
        LIMIT $2
        `,
        [userId, limit]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get complete conversation history including both user messages and agent results
   * This is useful for debugging and inspection purposes
   */
  async getCompleteHistory(threadId: string): Promise<any[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT 
          message_type,
          agent_name,
          content,
          data,
          created_at
        FROM ${this.tableNames.messages}
        WHERE thread_id = $1 
        ORDER BY created_at ASC
        `,
        [threadId]
      );

      return result.rows.map((row) => ({
        type: row.message_type,
        agentName: row.agent_name,
        content: row.content, // For user messages
        data: row.data, // For agent results
        createdAt: row.created_at,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Delete a thread and all its associated messages
   */
  async deleteThread(threadId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Delete messages first (though CASCADE should handle this)
      await client.query(
        `DELETE FROM ${this.tableNames.messages} WHERE thread_id = $1`,
        [threadId]
      );

      // Delete the thread
      const result = await client.query(
        `DELETE FROM ${this.tableNames.threads} WHERE thread_id = $1`,
        [threadId]
      );

      await client.query("COMMIT");

      console.log(
        `🗑️ Deleted thread ${threadId} and ${result.rowCount} associated records`
      );
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("❌ Failed to delete thread:", error);
      throw error;
    } finally {
      client.release();
    }
  }
}
