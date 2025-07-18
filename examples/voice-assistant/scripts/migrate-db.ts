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
        
        console.log('✅ Migration 002 completed successfully!');

        // Read and execute the second migration file
        const approvalMigrationPath = join(__dirname, '../db/migrations/003_add_approvals_table.sql');
        const approvalMigrationSQL = readFileSync(approvalMigrationPath, 'utf8');

        console.log('🚀 Executing migration: 003_add_approvals_table.sql');
        await client.query(approvalMigrationSQL);
        console.log('✅ Migration 003 completed successfully!');
        
        // Verify new columns exist
        const columnsResult = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'agentkit_messages' 
            AND column_name IN ('message_id', 'parent_message_id', 'event_type', 'event_data')
            ORDER BY column_name;
        `);
        
        console.log('\n📊 Columns from migration 002:');
        columnsResult.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });

        // Verify the new table exists
        const tableResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'agentkit_approvals';
        `);

        if (tableResult && tableResult.rows && tableResult.rows.length > 0 && tableResult.rows[0]) {
            console.log('\n📊 Table from migration 003:');
            console.log(`  - ${tableResult.rows[0].table_name}`);
        } else {
            console.log('\n❌ Verification failed: `agentkit_approvals` table not found.');
        }
        
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