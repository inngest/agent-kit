---
"@inngest/agent-kit": minor
---

Add OrcaRouter model support via a new `orcarouter()` helper. OrcaRouter is an OpenAI-compatible LLM router, so the helper reuses the `openai-chat` adapter and defaults the base URL to `https://api.orcarouter.ai/v1` and the API key to the `ORCAROUTER_API_KEY` environment variable. Pass `orcarouter/auto` to use OrcaRouter's adaptive routing.
