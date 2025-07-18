export const historyConfig = {
    connectionString: process.env.POSTGRES_URL || "postgresql://localhost:5432/agentkit_chat",
    tablePrefix: "agentkit_",
    schema: "public",
    maxTokens: 8000, 
    verbose: false, // Disable verbose logging
}; 