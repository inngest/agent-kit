import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

// Manually configure dotenv to load the correct .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;

async function fixConstraint() {
    const connectionString = process.env.POSTGRES_URL || 'postgresql://localhost:5432/agentkit_chat';
    
    console.log('🔧 Fixing approvals table constraint...');
    console.log(`📍 Database: ${connectionString}`);
    
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        console.log('✅ Connected to database');
        
        const constraintName = 'agentkit_approvals_event_id_to_wait_for_key';

        // Check if the constraint exists
        const checkResult = await client.query(`
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name = 'agentkit_approvals' 
              AND constraint_name = $1
              AND table_schema = 'public';
        `, [constraintName]);

        if (checkResult.rows.length > 0) {
            console.log(`Found unique constraint '${constraintName}'. Dropping it...`);
            await client.query(`
                ALTER TABLE public.agentkit_approvals
                DROP CONSTRAINT IF EXISTS ${constraintName};
            `);
            console.log(`✅ Constraint '${constraintName}' dropped successfully.`);
        } else {
            console.log(`✅ Constraint '${constraintName}' does not exist, no action needed.`);
        }

    } catch (error) {
        console.error('❌ Failed to fix constraint:', error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('\n👋 Database connection closed');
    }
}

fixConstraint().catch(console.error); 