import { Pool } from "pg";

// Create a single, shared connection pool.
// This instance will be reused across all function invocations within the same
// container, preventing connection pool exhaustion.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5431/use_agent_db",
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 5000, // How long to wait for a connection from the pool
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

console.log("🐘 PostgreSQL connection pool created");

export default pool;
