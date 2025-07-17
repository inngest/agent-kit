// using local build of agentkit
import {
    type HistoryConfig,
    type History,
    type StateData,
    AgentResult,
    type TextMessage,
    type Message,
  } from "@inngest/agent-kit";
import pg from "pg";
const { Pool } = pg;
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import type { VoiceAssistantNetworkState } from ".";
  
  // PostgreSQL History Configuration
  export interface PostgresHistoryConfig {
    connectionString: string;
    tablePrefix?: string;
    schema?: string;
    maxTokens?: number;
  }
  
  // Global adapter instance tracking for diagnostics
  let adapterInstanceCount = 0;
  const activeAdapters = new Set<string>();
  
  export class PostgresHistoryAdapter<T extends StateData>
    implements HistoryConfig<T>
  {
    private pool: InstanceType<typeof Pool>;
    private tablePrefix: string;
    private schema: string;
    private maxTokens?: number;
    private encoder: Tiktoken;
    private isClosing: boolean = false;
    private instanceId: string;
    private createdAt: Date;
  
    constructor(config: PostgresHistoryConfig) {
      // Diagnostic tracking
      this.instanceId = `adapter-${++adapterInstanceCount}-${Date.now()}`;
      this.createdAt = new Date();
      activeAdapters.add(this.instanceId);
      
      console.log(`🔧 [${this.instanceId}] PostgresHistoryAdapter created at ${this.createdAt.toISOString()}`);
      console.log(`📊 [${this.instanceId}] Active adapter instances: ${activeAdapters.size}`);
      console.log(`📊 [${this.instanceId}] Total adapters created: ${adapterInstanceCount}`);
      
      this.pool = new Pool({
        connectionString: config.connectionString,
        max: 20, // Max number of clients in the pool
        idleTimeoutMillis: 10000, // Close idle clients after 10 seconds
        connectionTimeoutMillis: 5000, // Abort connecting after 5 seconds
        query_timeout: 5000, // Abort any query that takes longer than 5 seconds
        maxUses: 7500, // Close a client after it has been used 7500 times
      });
      
      // Enhanced error handler with context
      this.pool.on('error', (err) => {
        console.error(`❌ [${this.instanceId}] PostgreSQL pool error (isClosing: ${this.isClosing}):`, err);
        console.error(`❌ [${this.instanceId}] Pool stats:`, {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        });
      });

      // Add connection event logging
      this.pool.on('connect', (client) => {
        console.log(`🔗 [${this.instanceId}] New client connected. Pool stats:`, {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        });
      });

      this.pool.on('acquire', (client) => {
        console.log(`📥 [${this.instanceId}] Client acquired from pool. Pool stats:`, {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        });
      });

      this.pool.on('release', (client) => {
        console.log(`📤 [${this.instanceId}] Client released to pool. Pool stats:`, {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        });
      });

      this.pool.on('remove', (client) => {
        console.log(`🗑️ [${this.instanceId}] Client removed from pool. Pool stats:`, {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        });
      });
      
      this.tablePrefix = config.tablePrefix || "agentkit_";
      this.schema = config.schema || "public";
      this.maxTokens = config.maxTokens;
      this.encoder = new Tiktoken(o200k_base);

      console.log(`⚙️ [${this.instanceId}] Pool configuration:`, {
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        tablePrefix: this.tablePrefix,
        schema: this.schema
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
      { state, step }: History.CreateThreadContext<T>
    ): Promise<{ threadId: string }> => {
      const operationStart = Date.now();
      console.log(`🆕 [${this.instanceId}] createThread starting...`);
      
      if (this.isClosing) {
        console.error(`❌ [${this.instanceId}] createThread called but adapter is closing`);
        throw new Error('Database connection is closing');
      }

      // Health check before operation
      const isHealthy = await this.checkConnection();
      if (!isHealthy) {
        console.error(`❌ [${this.instanceId}] Connection health check failed before createThread`);
        throw new Error('Database connection is unhealthy');
      }
      
      const client = await this.pool.connect();
      console.log(`🔗 [${this.instanceId}] Client acquired for createThread. Time: ${Date.now() - operationStart}ms`);
  
      try {
        const operation = async () => {
          const queryStart = Date.now();
          const result = await client.query(
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
          console.log(`📊 [${this.instanceId}] createThread query completed in ${Date.now() - queryStart}ms`);
          return result.rows[0].thread_id;
        };
  
        const threadId = step
          ? await step.run("create-thread", operation)
          : await operation();
  
        console.log(`✅ [${this.instanceId}] Created new thread: ${threadId} (total time: ${Date.now() - operationStart}ms)`);
        return { threadId };
      } catch (error) {
        console.error(`❌ [${this.instanceId}] createThread error after ${Date.now() - operationStart}ms:`, error);
        throw error;
      } finally {
        client.release();
        console.log(`📤 [${this.instanceId}] Client released after createThread. Total time: ${Date.now() - operationStart}ms`);
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
      const operationStart = Date.now();
      console.log(`📖 [${this.instanceId}] get starting for threadId: ${threadId}`);
      
      if (this.isClosing) {
        console.log(`⚠️ [${this.instanceId}] get called but adapter is closing, returning empty history`);
        return [];
      }
      
      if (!threadId) {
        console.log(`⚠️ [${this.instanceId}] No threadId provided to get, returning empty history`);
        return [];
      }

      // Health check before operation
      const isHealthy = await this.checkConnection();
      if (!isHealthy) {
        console.error(`❌ [${this.instanceId}] Connection health check failed before get`);
        return [];
      }
  
      const client = await this.pool.connect();
      console.log(`🔗 [${this.instanceId}] Client acquired for get. Time: ${Date.now() - operationStart}ms`);
  
      try {
        const operation = async () => {
          const queryStart = Date.now();
          // Fetch newest messages first if we have a token limit
          const queryOrder = this.maxTokens ? "DESC" : "ASC";
          const result = await client.query(
            `
            SELECT 
              message_type,
              content,
              data,
              created_at
            FROM ${this.tableNames.messages}
            WHERE thread_id = $1 
            ORDER BY created_at ${queryOrder}
          `,
            [threadId]
          );
          console.log(`📊 [${this.instanceId}] get query returned ${result.rows.length} rows in ${Date.now() - queryStart}ms`);
  
          const conversationResults: AgentResult[] = [];
          let totalTokens = 0;
          
          if (this.maxTokens) {
            // Add a fixed overhead for the conversation
            totalTokens += 25;
          }
  
          for (const row of result.rows) {
            let agentResult: AgentResult;
  
            if (row.message_type === 'user') {
              const userMessage: TextMessage = {
                type: "text",
                role: "user",
                content: row.content,
                stop_reason: "stop"
              };
  
              agentResult = new AgentResult(
                "user",
                [userMessage],
                [],
                new Date(row.created_at)
              );
            } else if (row.message_type === 'agent') {
              const data = row.data;
              agentResult = new AgentResult(
                data.agentName,
                data.output,
                data.toolCalls,
                new Date(data.createdAt)
              );
            } else {
              continue;
            }
  
            if (this.maxTokens) {
              const resultTokens = this.countTokensForAgentResult(agentResult);
              if (totalTokens + resultTokens > this.maxTokens) {
                console.log(`📊 [${this.instanceId}] Token limit of ${this.maxTokens} reached. Returning ${conversationResults.length} of ${result.rows.length} results.`);
                break;
              }
              totalTokens += resultTokens;
              conversationResults.unshift(agentResult);
            } else {
              conversationResults.push(agentResult);
            }
          }
          return conversationResults;
        };
  
        const results = step
          ? ((await step.run(
              "load-complete-history",
              operation
            )) as unknown as AgentResult[])
          : await operation();
        
        console.log(`✅ [${this.instanceId}] get completed with ${results.length} results (total time: ${Date.now() - operationStart}ms)`);
        return results;
      } catch (error) {
        console.error(`❌ [${this.instanceId}] get error after ${Date.now() - operationStart}ms:`, error);
        throw error;
      } finally {
        client.release();
        console.log(`📤 [${this.instanceId}] Client released after get. Total time: ${Date.now() - operationStart}ms`);
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
      state,
    }: History.Context<T> & {
      newResults: AgentResult[];
      userMessage?: {
        content: string;
        role: "user";
        timestamp: Date;
      };
    }): Promise<void> => {
      const operationStart = Date.now();
      console.log(`💾 [${this.instanceId}] appendResults starting for threadId: ${threadId}, newResults: ${newResults?.length || 0}, userMessage: ${!!userMessage}`);
      
      if (this.isClosing) {
        console.log(`⚠️ [${this.instanceId}] appendResults called but adapter is closing, skipping save`);
        return;
      }
      
      if (!threadId) {
        console.log(`⚠️ [${this.instanceId}] No threadId provided to appendResults, skipping save`);
        return;
      }
  
      if (!newResults?.length && !userMessage) {
        console.log(`⚠️ [${this.instanceId}] No newResults or userMessage provided to appendResults, skipping save`);
        return;
      }

      // Health check before operation
      const isHealthy = await this.checkConnection();
      if (!isHealthy) {
        console.error(`❌ [${this.instanceId}] Connection health check failed before appendResults`);
        return;
      }
  
      const client = await this.pool.connect();
      console.log(`🔗 [${this.instanceId}] Client acquired for appendResults. Time: ${Date.now() - operationStart}ms`);
  
      try {
        const operation = async () => {
          const transactionStart = Date.now();
          await client.query("BEGIN");
          console.log(`🔄 [${this.instanceId}] Transaction started`);
  
          try {
            // Upsert the thread record to ensure it exists before adding messages.
            console.log(`🔄 [${this.instanceId}] Upserting thread record...`);
            const upsertStart = Date.now();
            await client.query(
              `
              INSERT INTO ${this.tableNames.threads} (thread_id, user_id, metadata)
              VALUES ($1, $2, $3)
              ON CONFLICT (thread_id) DO UPDATE
              SET updated_at = NOW()
            `,
              [threadId, state.data.userId || null, JSON.stringify(state.data)]
            );
            console.log(`✅ [${this.instanceId}] Thread upsert completed in ${Date.now() - upsertStart}ms`);
  
            // Insert user message if provided
            if (userMessage) {
              console.log(`💬 [${this.instanceId}] Inserting user message...`);
              const userMessageStart = Date.now();
              const userChecksum = `user_${userMessage.timestamp.getTime()}_${userMessage.content.substring(0, 50)}`;
  
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
              console.log(`✅ [${this.instanceId}] User message inserted in ${Date.now() - userMessageStart}ms`);
            }
            
            // --- FIX: Replace raw agent output with clean final answer ---
            const finalResultsToSave = [...newResults];
            // Safely check for the assistantAnswer property
            const assistantAnswer = (state.data as Partial<VoiceAssistantNetworkState>).assistantAnswer;

            if (assistantAnswer) {
              // Polyfill-like approach for findLastIndex
              let assistantResultIndex = -1;
              for (let i = finalResultsToSave.length - 1; i >= 0; i--) {
                if (finalResultsToSave[i]?.agentName === 'personal-assistant-agent') {
                  assistantResultIndex = i;
                  break;
                }
              }

              if (assistantResultIndex !== -1) {
                const finalAnswerMessage: TextMessage = {
                  type: 'text',
                  role: 'assistant',
                  content: assistantAnswer,
                  stop_reason: 'stop',
                };
                
                const originalResult = finalResultsToSave[assistantResultIndex];
                if (originalResult) {
                    finalResultsToSave[assistantResultIndex] = new AgentResult(
                        originalResult.agentName,
                        [finalAnswerMessage],
                        [],
                        new Date(),
                        originalResult.prompt,
                        originalResult.history
                    );
                    console.log(`🤖 [${this.instanceId}] Overwrote assistant result with clean final answer.`);
                }
              }
            }
            // --- END FIX ---
  
            // Insert agent results
            if (finalResultsToSave?.length > 0) {
              console.log(`🤖 [${this.instanceId}] Inserting ${finalResultsToSave.length} agent messages...`);
              const agentMessagesStart = Date.now();
              for (const result of finalResultsToSave) {
                const exportedData = result.export();
  
                await client.query(
                  `
                  INSERT INTO ${this.tableNames.messages} (thread_id, message_type, agent_name, data, checksum)
                  VALUES ($1, 'agent', $2, $3, $4)
                  ON CONFLICT (thread_id, checksum) DO NOTHING
                `,
                  [threadId, result.agentName, exportedData, result.checksum]
                );
              }
              console.log(`✅ [${this.instanceId}] Agent messages inserted in ${Date.now() - agentMessagesStart}ms`);
            }
  
            await client.query("COMMIT");
            console.log(`✅ [${this.instanceId}] Transaction committed in ${Date.now() - transactionStart}ms`);
  
            const totalSaved = (userMessage ? 1 : 0) + (finalResultsToSave?.length || 0);
            console.log(`💾 [${this.instanceId}] Saved ${totalSaved} messages to thread ${threadId} (${userMessage ? "1 user + " : ""}${finalResultsToSave?.length || 0} agent)`);
          } catch (error) {
            console.error(`❌ [${this.instanceId}] Transaction error after ${Date.now() - transactionStart}ms:`, error);
            await client.query("ROLLBACK");
            throw error;
          }
        };
  
        step ? await step.run("save-results", operation) : await operation();
        console.log(`✅ [${this.instanceId}] appendResults completed (total time: ${Date.now() - operationStart}ms)`);
      } catch (error) {
        console.error(`❌ [${this.instanceId}] appendResults failed after ${Date.now() - operationStart}ms:`, error);
        throw error;
      } finally {
        client.release();
        console.log(`📤 [${this.instanceId}] Client released after appendResults. Total time: ${Date.now() - operationStart}ms`);
      }
    };
  
    /**
     * Close the database connection pool
     */
    async close(): Promise<void> {
      console.log(`🔌 [${this.instanceId}] Closing adapter (age: ${Date.now() - this.createdAt.getTime()}ms)`);
      this.isClosing = true;
      activeAdapters.delete(this.instanceId);
      console.log(`📊 [${this.instanceId}] Active adapters after close: ${activeAdapters.size}`);
      
      try {
      await this.pool.end();
        console.log(`✅ [${this.instanceId}] PostgreSQL connection pool closed successfully`);
      } catch (error) {
        console.error(`❌ [${this.instanceId}] Error closing pool:`, error);
      }
    }

    /**
     * Check if the connection is healthy
     */
    private async checkConnection(): Promise<boolean> {
      if (this.isClosing) {
        console.log(`⚠️ [${this.instanceId}] Connection check skipped - adapter is closing`);
        return false;
      }
      
      try {
        const healthCheckStart = Date.now();
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();
        console.log(`✅ [${this.instanceId}] Connection health check passed in ${Date.now() - healthCheckStart}ms`);
        return true;
      } catch (error) {
        console.error(`❌ [${this.instanceId}] Connection health check failed:`, error);
        console.error(`❌ [${this.instanceId}] Pool stats during health check failure:`, {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        });
        return false;
      }
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
  
    private countTokensForAgentResult(result: AgentResult): number {
        let tokenString = '';
        let toolOverhead = 0;
        const TOKENS_PER_MESSAGE = 3.8;
        const TOKENS_PER_TOOL = 2.2;
    
        const allMessages = [...result.output, ...(result.toolCalls as Message[])];
    
        for (const message of allMessages) {
            tokenString += message.role || '';
            
            if (message.type === 'text') {
                if (typeof message.content === 'string') {
                    tokenString += message.content;
                } else if (Array.isArray(message.content)) {
                    for (const part of message.content) {
                        tokenString += part.text;
                    }
                }
            } else if (message.type === 'tool_call') {
                for (const tool of message.tools) {
                    tokenString += tool.name;
                    tokenString += JSON.stringify(tool.input);
                    toolOverhead += TOKENS_PER_TOOL;
                }
            } else if (message.type === 'tool_result') {
                tokenString += message.tool.name;
                if (message.content) {
                    tokenString += JSON.stringify(message.content);
                }
                toolOverhead += TOKENS_PER_TOOL;
            }
        }
    
        const messageOverhead = allMessages.length * TOKENS_PER_MESSAGE;
        return this.encoder.encode(tokenString).length + messageOverhead + toolOverhead;
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
  