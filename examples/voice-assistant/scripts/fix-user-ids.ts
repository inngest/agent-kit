import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

// Database configuration
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || "postgresql://localhost:5432/agentkit_chat",
  max: 5,
});

async function fixUserIds() {
  console.log('🔧 Fixing user IDs in existing threads\n');
  
  try {
    // Update all threads with NULL user_id to 'default-user'
    const result = await pool.query(`
      UPDATE public.agentkit_threads
      SET user_id = 'default-user'
      WHERE user_id IS NULL;
    `);
    
    console.log(`✅ Updated ${result.rowCount} threads to have user_id = 'default-user'`);
    
    // Verify the update
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM public.agentkit_threads
      WHERE user_id = 'default-user';
    `);
    
    console.log(`\n📊 Total threads with user_id = 'default-user': ${verifyResult.rows[0].count}`);
    
    // Show a sample of updated threads
    const sampleResult = await pool.query(`
      SELECT thread_id, user_id, created_at
      FROM public.agentkit_threads
      WHERE user_id = 'default-user'
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    
    console.log('\n📝 Sample of updated threads:');
    sampleResult.rows.forEach((thread, i) => {
      console.log(`${i + 1}. Thread ID: ${thread.thread_id.substring(0, 8)}... | User: ${thread.user_id}`);
    });
    
  } catch (error) {
    console.error('❌ Error updating user IDs:', error);
  } finally {
    await pool.end();
    console.log('\n✅ Database connection closed');
  }
}

// Run the fix
fixUserIds().catch(console.error); 