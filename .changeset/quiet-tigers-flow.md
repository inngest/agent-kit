---
"@inngest/agent-kit": patch
---

Fix MCP tools crashing with `TypeError: Cannot read properties of undefined (reading 'def')`. MCP tool input schemas are now passed through to the model adapters as JSON Schema instead of being run through a JSON Schema -> Zod -> JSON Schema round-trip that produced a schema incompatible with the Zod version used by the adapters.
