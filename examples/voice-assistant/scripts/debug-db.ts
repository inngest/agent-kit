import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

// Database configuration
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || "postgresql://localhost:5432/agentkit_chat",
  max: 5,
});

async function debugDatabase() {
  console.log('🔍 Debugging AgentKit Database\n');
  
  try {
    // 1. Check if tables exist
    console.log('📊 Checking tables...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'agentkit_%'
      ORDER BY table_name;
    `);
    
    console.log('Found tables:', tablesResult.rows.map(r => r.table_name));
    console.log();

    // 2. Check threads table
    console.log('🧵 Threads table contents:');
    const threadsResult = await pool.query(`
      SELECT 
        thread_id,
        user_id,
        metadata,
        created_at,
        updated_at
      FROM public.agentkit_threads
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    
    console.log(`Found ${threadsResult.rowCount} threads (showing latest 10):`);
    threadsResult.rows.forEach((thread, i) => {
      console.log(`\n${i + 1}. Thread ID: ${thread.thread_id}`);
      console.log(`   User ID: ${thread.user_id || 'NULL'}`);
      console.log(`   Created: ${thread.created_at}`);
      console.log(`   Updated: ${thread.updated_at}`);
      console.log(`   Metadata: ${JSON.stringify(thread.metadata)}`);
    });
    console.log();

    // 3. Check messages table
    console.log('💬 Messages table summary:');
    const messagesResult = await pool.query(`
      SELECT 
        thread_id,
        message_type,
        agent_name,
        COUNT(*) as count
      FROM public.agentkit_messages
      GROUP BY thread_id, message_type, agent_name
      ORDER BY thread_id DESC;
    `);
    
    console.log('Message counts by thread:');
    let currentThreadId = '';
    messagesResult.rows.forEach(row => {
      if (row.thread_id !== currentThreadId) {
        currentThreadId = row.thread_id;
        console.log(`\nThread ${row.thread_id}:`);
      }
      console.log(`  - ${row.message_type} messages${row.agent_name ? ` (${row.agent_name})` : ''}: ${row.count}`);
    });
    console.log();

    // 4. Sample messages
    console.log('📝 Sample messages (latest 5):');
    const sampleMessages = await pool.query(`
      SELECT 
        thread_id,
        message_type,
        agent_name,
        content,
        data,
        created_at
      FROM public.agentkit_messages
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    
    sampleMessages.rows.forEach((msg, i) => {
      console.log(`\n${i + 1}. Message in thread ${msg.thread_id.substring(0, 8)}...`);
      console.log(`   Type: ${msg.message_type}${msg.agent_name ? ` (${msg.agent_name})` : ''}`);
      console.log(`   Created: ${msg.created_at}`);
      
      if (msg.message_type === 'user' && msg.content) {
        console.log(`   Content: "${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}"`);
      } else if (msg.message_type === 'agent' && msg.data) {
        const agentData = msg.data as any;
        if (agentData.output && Array.isArray(agentData.output)) {
          const textOutput = agentData.output.find((o: any) => o.type === 'text' && o.role === 'assistant');
          if (textOutput) {
            console.log(`   Response: "${textOutput.content.substring(0, 100)}${textOutput.content.length > 100 ? '...' : ''}"`);
          }
        }
      }
    });
    console.log();

    // 5. Test the listThreads query that the CLI uses
    console.log('🔍 Testing listThreads query (what the CLI uses):');
    const listThreadsResult = await pool.query(`
      SELECT thread_id, metadata, created_at, updated_at 
      FROM public.agentkit_threads 
      WHERE user_id = $1 
      ORDER BY updated_at DESC 
      LIMIT 20
    `, ['default-user']);
    
    console.log(`\nQuery for user_id='default-user' returned ${listThreadsResult.rowCount} threads`);
    
    // 6. Check what user IDs actually exist
    console.log('\n👥 Unique user IDs in database:');
    const userIdsResult = await pool.query(`
      SELECT DISTINCT user_id, COUNT(*) as thread_count
      FROM public.agentkit_threads
      GROUP BY user_id
      ORDER BY thread_count DESC;
    `);
    
    userIdsResult.rows.forEach(row => {
      console.log(`  - "${row.user_id}": ${row.thread_count} threads`);
    });

    // 7. Check for any orphaned messages
    console.log('\n⚠️  Checking data integrity:');
    const orphanedMessages = await pool.query(`
      SELECT COUNT(*) as count
      FROM public.agentkit_messages m
      LEFT JOIN public.agentkit_threads t ON m.thread_id = t.thread_id
      WHERE t.thread_id IS NULL;
    `);
    
    console.log(`Orphaned messages (no matching thread): ${orphanedMessages.rows[0].count}`);

  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await pool.end();
    console.log('\n✅ Database connection closed');
  }
}

// Run the debug script
debugDatabase().catch(console.error); 