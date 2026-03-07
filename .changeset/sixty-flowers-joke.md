---
"@inngest/agent-kit": patch
---

Add support for reasoning models: extract reasoning/thinking content from OpenAI o-series and Anthropic extended thinking responses into a new `ReasoningMessage` type, stream reasoning deltas, and skip reasoning messages in outbound requests across all adapters.
