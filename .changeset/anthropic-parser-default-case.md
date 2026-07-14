---
"@inngest/agent-kit": patch
---

Fix the Anthropic response parser crashing on content blocks it does not map to a network message. The parser's `switch` handled only `text` and `tool_use` and had no `default` case, so an unrecognized block (for example `redacted_thinking`, or a block type added in a future API version) made the `reduce` callback return `undefined`; the next iteration's `...acc` spread then threw `Spread syntax requires ...iterable not be null or undefined`, failing the whole response parse. Unknown blocks are now skipped.
