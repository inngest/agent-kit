# Neon Database Agent

This AgentKit Agent relies on the [Smithery MCP Server for Neon](https://smithery.ai/server/neon) to communicate with the Neon API and execute tasks such as:

- `Let's create a new Postgres database, and call it "my-database". Let's then create a table called users with the following columns: id, name, email, and password.`
- `I want to run a migration on my project called "my-project" that alters the users table to add a new column called "created_at".`
- `Can you give me a summary of all of my Neon projects and what data is in each one?`

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- An Anthropic API key for Claude
- A Neon database account and API key

## Running the Agent

1. Clone the repository and navigate to the example directory:

   ```bash
   cd examples/mcp-neon-agent
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with your API keys:

```
ANTHROPIC_API_KEY=your_anthropic_api_key
NEON_API_KEY=your_neon_api_key
```

[Get your Neon API key.](https://neon.tech/docs/reference/api-reference#authentication)

4. Start the Agent:

   ```bash
   npm start
   ```

5. Start the Inngest Dev Server:

```
npx inngest-cli@latest dev
```

You can now open the Inngest DevServer at [http://127.0.0.1:8288/functions](http://127.0.0.1:8288/functions)

6. Run the Agent:

From the "Functions" page, click on the `neon-network` function and click the "Invoke" button to provide the following payload:

```json
{
  "data": {
    "input": "Can you give me a summary of all of my Neon projects and what data is in each one?"
  }
}
```

You'll be redirected to the Agent run view where each step of the agent will be displayed.

## License

MIT
