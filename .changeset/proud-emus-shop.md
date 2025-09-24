---
"@inngest/agent-kit": patch
---

replacing the static import of json-schema-to-zod with a dynamic import() inside the function where it's used to resolve crashing when loading agentkit in a cjs project using require()
