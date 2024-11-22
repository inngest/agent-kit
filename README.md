# ![AgentKit by Inngest](./.github/logo.png)

<p align="center">
    <a href="https://www.inngest.com/docs/agent-kit/overview?ref=github-agent-kit-readme">Documentation</a>
    <span>&nbsp;·&nbsp;</span>
    <a href="https://www.inngest.com/blog?ref=github-agent-kit-readme">Blog</a>
    <span>&nbsp;·&nbsp;</span>
    <a href="https://www.inngest.com/discord">Community</a>
</p>

# AgentKit

AgentKit is a framework for creating and orchestrating AI Agents, from single model inference calls to multi-agent systems that use tools. Designed with orchestration at it’s core, AgentKit enables developers to build, test, and deploy reliable AI applications at scale.

- [Overview](#overview)
- [Installation](#installation)
- [Documentation](#documentation)
- [Examples](#examples)

## Overview

A networked agent:

```ts
// Create a network of agents with separate tasks and instructions
// to solve a specific task.
const network = createNetwork({
  agents: [navigator, classifier, summarizer],
  defaultModel: agenticOpenai({ model: "gpt-4o", step }),
});

const input = `Classify then summarize the latest 10 blog posts
  on https://www.deeplearning.ai/blog/`;

const result = await network.run(input, ({ network }) => {
  // Use an agent which figures out the specific agent to call
  // based off of the network's history.
  return defaultRoutingAgent;
});
```

A simple agent:

```ts
const writer = createAgent({
  name: "writer",
  system:
    "You are an expert writer.  You write readable, concise, simple content.",
  model: agenticOpenai({ model: "gpt-4o", step }),
});

const { output } = await writer.run(
  "Describe the ideas behind the given input into clear topics, and explain any insight: " +
    `<content>${content}</content>`,
);
```

## Installation

Agent kit requires the [Inngest TypeScript SDK](https://github.com/inngest/inngest-js) as a dependency. You can install both via `npm` or similar:

```shell {{ title: "npm" }}
npm install @inngest/agent-kit inngest
```

## Documentation

The full Agent kit documentation is available
[here](https://www.inngest.com/docs/agent-kit/overview). You can also jump to
specific guides and references:

- [Agents and Tools](https://www.inngest.com/docs/agent-kit/ai-agents-tools)
- [Network, state, and routing](https://www.inngest.com/docs/agent-kit/ai-agent-network-state-routing)

## Examples

See Agent kit in action in fully functioning example projects:

- [Test Writing Network](/demo#readme) - A ready-to-deploy Next.js demo using the Workflow Kit, Supabase, and OpenAI to power some AI content workflows.

## License

[Apache 2.0](LICENSE.md)
