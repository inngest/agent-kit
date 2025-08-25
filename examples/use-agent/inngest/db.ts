// using local build of agentkit
import {
  type HistoryConfig,
  type History,
  type StateData,
  AgentResult,
  type TextMessage,
} from "@inngest/agent-kit";
import { Pool } from "pg";
import pool from "./pool";

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

  constructor(config: Omit<PostgresHistoryConfig, 'connectionString'> & { connectionString?: string }) {
    this.pool = pool;
    this.tablePrefix = config.tablePrefix || "agentkit_";
    this.schema = config.schema || "public";

    // Gracefully close the pool on exit
    process.on('SIGTERM', () => {
      this.close().catch(console.error);
    });
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
  async initializeTables(): Promise<{
    status: string;
    threadsTableExisted: boolean;
    messagesTableExisted: boolean;
    message: string;
  }> {
    const client = await this.pool.connect();

    try {
      const threadsTableName = `${this.tablePrefix}threads`;
      const messagesTableName = `${this.tablePrefix}messages`;

      const checkThreads = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 AND table_name = $2
        )`,
        [this.schema, threadsTableName]
      );
      const threadsTableExisted = checkThreads.rows[0].exists;

      const checkMessages = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 AND table_name = $2
        )`,
        [this.schema, messagesTableName]
      );
      const messagesTableExisted = checkMessages.rows[0].exists;

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

      const message =
        threadsTableExisted && messagesTableExisted
          ? "All tables already existed. Check complete."
          : "One or more tables were created during initialization.";

      return {
        status: "completed",
        threadsTableExisted,
        messagesTableExisted,
        message,
      };
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
    { state, step }: History.CreateThreadContext<T>
  ): Promise<{ threadId: string }> => {
    const operation = async () => {
      const client = await this.pool.connect();
      try {
        // If a threadId already exists on state, upsert that ID to ensure
        // subsequent message inserts referencing this threadId succeed.
        if (state.threadId) {
          console.log(`🔄 Upserting thread: ${state.threadId} for user: ${state.data.userId || 'none'}`);
          console.log(`📊 Thread data:`, {
            threadId: state.threadId,
            userId: state.data.userId || null,
            metadataSize: JSON.stringify(state.data).length
          });
          
          const upsert = await client.query(
            `
            INSERT INTO ${this.tableNames.threads} (thread_id, user_id, metadata)
            VALUES ($1, $2, $3)
            ON CONFLICT (thread_id) DO UPDATE
            SET updated_at = NOW()
            RETURNING thread_id
          `,
            [
              state.threadId,
              state.data.userId || null,
              JSON.stringify(state.data),
            ]
          );
          console.log(`✅ Thread upserted successfully: ${upsert.rows[0].thread_id}`);
          console.log(`📋 Upsert affected ${upsert.rowCount} rows`);
          return upsert.rows[0].thread_id;
        }

        // Otherwise create a new thread and return the generated ID.
        console.log(`🆕 Creating new thread`);
        const insert = await client.query(
          `
          INSERT INTO ${this.tableNames.threads} (user_id, metadata)
          VALUES ($1, $2)
          RETURNING thread_id
        `,
          [
            state.data.userId || null,
            JSON.stringify(state.data), // Persist initial state data
          ]
        );
        console.log(`✅ New thread created: ${insert.rows[0].thread_id}`);
        return insert.rows[0].thread_id;
      } finally {
        client.release();
      }
    };

    try {
      const threadId = step
        ? await step.run("create-thread", operation)
        : await operation();

      console.log(`🆕 Thread creation completed: ${threadId}`);
      return { threadId };
    } catch (error) {
      console.error("❌ Error in createThread:", error);
      throw error;
    }
  };

  /**
   * Load conversation history from storage.
   * 
   * Returns complete conversation context including both user messages and agent results.
   * User messages are converted to fake AgentResults (agentName: "user") to maintain
   * consistency with the client-side pattern and preserve conversation continuity.
   */
  get = async ({ threadId, step }: History.Context<T>): Promise<AgentResult[]> => {
    if (!threadId) {
      console.log("No threadId provided, returning empty history");
      return [];
    }

    const operation = async () => {
      const client = await this.pool.connect();
      try {
        // Load complete conversation history (both user messages and agent results)
        const result = await client.query(
          `
          SELECT 
            message_type,
            content,
            data,
            created_at
          FROM ${this.tableNames.messages}
          WHERE thread_id = $1 
          ORDER BY created_at ASC
        `,
          [threadId]
        );

        const conversationResults: AgentResult[] = [];

        for (const row of result.rows) {
          if (row.message_type === 'user') {
            // Convert user message to fake AgentResult (matching UI pattern)
            const userMessage: TextMessage = {
              type: "text",
              role: "user",
              content: row.content,
              stop_reason: "stop"
            };

            const fakeUserResult = new AgentResult(
              "user", // agentName: "user" (matches UI pattern)
              [userMessage], // output contains the user message
              [], // no tool calls for user messages
              new Date(row.created_at)
            );

            conversationResults.push(fakeUserResult);
          } else if (row.message_type === 'agent') {
            // Deserialize real AgentResult objects from JSONB
          const data = row.data;
            const realAgentResult = new AgentResult(
            data.agentName,
            data.output,
            data.toolCalls,
            new Date(data.createdAt)
          );

            conversationResults.push(realAgentResult);
          }
        }

        return conversationResults;
      } finally {
        client.release();
      }
    };

    const results = step
      ? ((await step.run(
          "load-complete-history",
          operation
        )) as unknown as AgentResult[])
      : await operation();
    
    return results;
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
  }): Promise<any> => {
    if (!threadId) {
      console.log("No threadId provided, skipping save");
      return;
    }

    if (!newResults?.length && !userMessage) {
      console.log("No newResults or userMessage provided, skipping save");
      return;
    }

    const operation = async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");

        try {
          // First, verify the thread exists
          console.log(`🔍 Verifying thread exists: ${threadId}`);
          console.log(`🔍 Current step context: ${step ? 'HAS_STEP' : 'NO_STEP'}`);
          
          const threadCheck = await client.query(
            `SELECT thread_id FROM ${this.tableNames.threads} WHERE thread_id = $1`,
            [threadId]
          );

          if (threadCheck.rows.length === 0) {
            // Before failing, let's see what threads DO exist
            console.log(`❌ Thread ${threadId} not found. Checking what threads exist...`);
            const allThreads = await client.query(
              `SELECT thread_id, created_at FROM ${this.tableNames.threads} ORDER BY created_at DESC LIMIT 5`
            );
            console.log(`📋 Recent threads in database:`, allThreads.rows);
            
            throw new Error(`Thread ${threadId} does not exist in the database. This indicates a thread creation issue.`);
          }
          console.log(`✅ Thread verified: ${threadId}`);

          // Update thread's updated_at timestamp
          console.log("Updating thread timestamp...");
          const updateResult = await client.query(
            `
            UPDATE ${this.tableNames.threads}
            SET updated_at = NOW()
            WHERE thread_id = $1
          `,
            [threadId]
          );
          console.log(`Updated ${updateResult.rowCount} thread record`);

          // Insert user message if provided
          if (userMessage) {
            console.log("Inserting user message...");
            // Create a deterministic checksum that includes content for deduplication
            const contentHash = Buffer.from(userMessage.content).toString('base64').substring(0, 20);
            const userChecksum = `user_${contentHash}_${userMessage.timestamp.getTime()}`;

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
            console.log("User message inserted successfully");
          }

          // Insert agent results
          if (newResults?.length > 0) {
            console.log(`Inserting ${newResults.length} agent messages...`);
            for (const result of newResults) {
              const exportedData = result.export();

              await client.query(
                `
                INSERT INTO ${this.tableNames.messages} (thread_id, message_type, agent_name, data, checksum)
                VALUES ($1, 'agent', $2, $3, $4)
                ON CONFLICT (thread_id, checksum) DO NOTHING
              `,
                [threadId, result.agentName, exportedData, result.checksum]
              );
              console.log(`Agent message from ${result.agentName} inserted successfully`);
            }
          }

          await client.query("COMMIT");

          const totalSaved = (userMessage ? 1 : 0) + (newResults?.length || 0);
          const saveResult = {
            success: true,
            threadId,
            messagesSaved: totalSaved,
            userMessage: !!userMessage,
            agentResults: newResults?.length || 0,
            timestamp: new Date().toISOString()
          };
          
          console.log(
            `💾 Saved ${totalSaved} messages to thread ${threadId} (${
              userMessage ? "1 user + " : ""
            }${newResults?.length || 0} agent)`
          );
          
          return saveResult;
        } catch (error) {
          console.error("❌ Error during transaction:", error);
          await client.query("ROLLBACK");
          throw error;
        }
      } finally {
        client.release();
      }
    };

    try {
      const result = step ? await step.run("save-results", operation) : await operation();
      console.log("✅ [SAVE-RESULTS] Step completed successfully:", result);
      return result;
    } catch (error) {
      console.error("❌ appendResults failed:", error);
      throw error;
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
   * Get complete conversation history including both user messages and agent results.
   * 
   * Returns the same complete conversation data as get() but in a different format
   * optimized for debugging and inspection. While get() returns AgentResult objects
   * (including user messages converted to AgentResults), this method returns raw database records.
   * 
   * Use this method for debugging, UI display, or when you need the raw database format
   * rather than the AgentResult format used by the framework.
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

  /**
   * List threads with pagination support
   */
  async listThreadsWithPagination(userId: string, limit: number = 20, offset: number = 0): Promise<{
    threads: Array<{
      id: string;
      title: string;
      messageCount: number;
      lastMessageAt: Date;
      createdAt: Date;
      updatedAt: Date;
    }>;
    hasMore: boolean;
    total: number;
  }> {
    const client = await this.pool.connect();

    try {
      // Get total count for this user
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM ${this.tableNames.threads} WHERE user_id = $1`,
        [userId]
      );
      const total = parseInt(countResult.rows[0].total);

      // Get threads with message counts and last message time
      const threadsResult = await client.query(
        `
        SELECT 
          t.thread_id,
          t.metadata,
          t.created_at,
          t.updated_at,
          COUNT(m.id) as message_count,
          MAX(m.created_at) as last_message_at
        FROM ${this.tableNames.threads} t
        LEFT JOIN ${this.tableNames.messages} m ON t.thread_id = m.thread_id
        WHERE t.user_id = $1
        GROUP BY t.thread_id, t.metadata, t.created_at, t.updated_at
        ORDER BY t.updated_at DESC
        LIMIT $2 OFFSET $3
        `,
        [userId, limit, offset]
      );

      const threads = threadsResult.rows.map(row => ({
        id: row.thread_id,
        title: this.extractTitleFromMetadata(row.metadata) || "New conversation",
        messageCount: parseInt(row.message_count),
        lastMessageAt: row.last_message_at || row.created_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      const hasMore = offset + limit < total;

      return {
        threads,
        hasMore,
        total,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Generate thread title from first user message
   */
  async generateThreadTitle(threadId: string): Promise<string> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT content 
        FROM ${this.tableNames.messages}
        WHERE thread_id = $1 AND message_type = 'user'
        ORDER BY created_at ASC
        LIMIT 1
        `,
        [threadId]
      );

      if (result.rows.length > 0) {
        const content = result.rows[0].content;
        // Truncate to 50 characters for title
        return content.length > 50 ? content.substring(0, 47) + "..." : content;
      }

      return "New conversation";
    } finally {
      client.release();
    }
  }

  /**
   * Update thread title in metadata
   */
  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get current metadata
      const current = await client.query(
        `SELECT metadata FROM ${this.tableNames.threads} WHERE thread_id = $1`,
        [threadId]
      );

      if (current.rows.length === 0) {
        throw new Error(`Thread ${threadId} not found`);
      }

      const metadata = current.rows[0].metadata || {};
      metadata.title = title;

      // Update with new title
      await client.query(
        `
        UPDATE ${this.tableNames.threads}
        SET metadata = $2, updated_at = NOW()
        WHERE thread_id = $1
        `,
        [threadId, JSON.stringify(metadata)]
      );

      console.log(`✅ Updated thread ${threadId} title to: ${title}`);
    } finally {
      client.release();
    }
  }

  /**
   * Extract title from thread metadata
   */
  private extractTitleFromMetadata(metadata: any): string | null {
    if (metadata && typeof metadata === 'object' && metadata.title) {
      return metadata.title;
    }
    return null;
  }
}
