---
"@inngest/agent-kit": patch
---

Fix `agent.run()` with `maxIter` greater than 0 dropping the conversation history and tool results from follow-up inference calls, which made providers reject the request.
