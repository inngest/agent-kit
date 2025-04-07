# @inngest/agent-kit

## 0.7.1

### Patch Changes

- f630722: Optimize parallelism in `createServer()`, removing risk of parallel indexing

## 0.7.0

### Minor Changes

- a5f2fea: Refactor AgentResult, and allow conversational history + short term mem

## 0.6.0

### Minor Changes

- e32af3d: Implement typed state management

### Patch Changes

- 51a076c: Document typed state, re-add KV for backcompat
- 7eeadbd: fix(network): add back-compat for `defaultRouter`

## 0.5.1

### Patch Changes

- 3257ff2: fix(mcp): emit valid tool name from MCP tools

## 0.5.0

### Minor Changes

- 9688973: Gemini and Grok support

### Patch Changes

- 13643d9: fix(tools): better support for strict mode + option to opt-out

## 0.4.1

### Patch Changes

- cc44a77: chore: update `inngest` and `@inngest/ai` to latest

## 0.4.0

### Minor Changes

- 7f26053: chore: bump `@inngest/ai` for model hyper params support
  Breaking change: `anthropic()` `max_tokens` options has been moved in `defaultParameters`

### Patch Changes

- c623d8a: fix(models): avoid `parallel_tool_calls` for o3-mini

## 0.3.1

### Patch Changes

- bbb5d1c: Dual publish ESM and CJS

## 0.3.0

### Minor Changes

- 1da7554: fix(index.ts): remove `server` export to allow non-Node runtimes

### Patch Changes

- 9a9f500: fix(openai): tools with no parameters
- 07f2634: feat(models): handle error reponses

## 0.2.2

### Patch Changes

- 1720646: Resolve being unable to find async ctx when using with `inngest`
- ae56867: Use `@inngest/ai` and only optionally use step tooling
- 6b309bb: Allow specifying Inngest functions as tools
- 4d6b263: Shift to pnpm workspace packages; fix linting

## 0.2.1

### Patch Changes

- d40a5c3: fix(adapters/openai): safely parse non-strong tool return value for Function calling

## 0.2.0

### Minor Changes

- c8343c0: Add basic AgentKit server to serve agents and networks as Inngest functions for easy testing
- ec689b8: fix(models/anthropic): ensure that the last message isn't an assistant one

### Patch Changes

- d4a0d26: Update description for npm

## 0.1.2

### Patch Changes

- 4e94cb2: Ensure tools mutate state, not a clone

## 0.1.1

### Patch Changes

- 9f302e4: Network state flow to agents

## 0.1.0

### Minor Changes

- f7158e4: Stepless model/network/agent instantiations

## 0.0.3

### Patch Changes

- 146d976: Fix README links and code examples
- be20dc9: Fix tool usage failing with OpenAI requests

## 0.0.2

### Patch Changes

- 36169d9: Fix GitHub link and add `README.md`

## 0.0.1

### Patch Changes

- 5c78a6a: Initial release!
