import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
    const connectionString = process.env.POSTGRES_URL || 'postgresql://localhost:5432/agentkit_chat';
    
    console.log('🔄 Running database migration...');
    console.log(`📍 Database: ${connectionString}`);
    
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        console.log('✅ Connected to database');
        
        // Read migration file
        const migrationPath = join(__dirname, '../db/migrations/002_add_branching_and_hitl.sql');
        const migrationSQL = readFileSync(migrationPath, 'utf8');
        
        console.log('🚀 Executing migration: 002_add_branching_and_hitl.sql');
        
        // Execute migration
        await client.query(migrationSQL);
        
        console.log('✅ Migration completed successfully!');
        
        // Verify new columns exist
        const result = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'agentkit_messages' 
            AND column_name IN ('message_id', 'parent_message_id', 'event_type', 'event_data')
            ORDER BY column_name;
        `);
        
        console.log('\n📊 New columns added:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('\n👋 Database connection closed');
    }
}

// Run the migration
runMigration().catch(console.error); 