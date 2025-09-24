// Configuration for AgentKit Chat with PostgreSQL History
export const config = {
  // PostgreSQL Database Configuration
  database: {
    connectionString:
      process.env.POSTGRES_URL || "postgresql://localhost:5432/agentkit_chat",
    tablePrefix: "agentkit_",
    schema: "public",
  },

  // Default user ID for testing (in production, this would come from authentication)
  defaultUserId: "test-user-123",

  // Whether to initialize database tables on startup
  initializeDatabase: process.env.NODE_ENV !== "production",
} as const;
