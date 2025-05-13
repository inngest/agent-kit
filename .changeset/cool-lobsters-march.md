---
"@inngest/agent-kit": patch
---

Removed redundant call to this.listMCPTools(server) as we are now using a promises array to handle multiple servers concurrently

Fixed conditional in MCP client initialization and moved this.\_mcpClients.push(client) to the beginning of listMCPTools method to prevent duplicate clients from being registered
