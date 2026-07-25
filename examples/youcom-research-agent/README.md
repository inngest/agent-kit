# You.com Research Agent

This AgentKit Agent demonstrates integration with the [You.com MCP Server](https://api.you.com/mcp) for web search, content extraction, and research tasks such as:

- `What are the latest developments in AI agent frameworks?`
- `Research the current state of Model Context Protocol adoption and provide a comprehensive report with sources`
- `Find and summarize recent news about web search API integrations in AI tools`

## Features

- **Web Search**: Access current web information via You.com Search API
- **Content Extraction**: Read and analyze specific URLs with You.com Contents API  
- **Research Synthesis**: Generate cited reports using You.com Research API
- **Keyless Fallback**: Works without API key (100 free searches/day per IP)

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- An Anthropic API key for Claude
- Optionally, a You.com API key for higher quotas and enhanced features

## Running the Agent

1. Clone the repository and navigate to the example directory:

   ```bash
   cd examples/youcom-research-agent
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with your API keys:

```
ANTHROPIC_API_KEY=your_anthropic_api_key
YDC_API_KEY=your_youcom_api_key  # Optional - uses keyless tier if not provided
```

[Get your You.com API key](https://api.you.com/) for higher quotas and enhanced features.

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

From the "Functions" page, click on the `youcom-research-network` function and click the "Invoke" button to provide the following payload:

```json
{
  "data": {
    "input": "What are the latest developments in AI agent frameworks? Provide a comprehensive research report with sources."
  }
}
```

You'll be redirected to the Agent run view where each step of the research agent will be displayed.

## How it Works

The agent uses the You.com MCP Server which provides three main tools:

- **you-search**: Current web search with snippets and source discovery
- **you-contents**: Full content extraction from URLs  
- **you-research**: One-shot cited synthesis and research reports

The integration automatically handles:
- API key authentication when `YDC_API_KEY` is provided
- Keyless operation fallback for quick testing
- Error handling and retry logic
- Proper citation formatting

## License

MIT