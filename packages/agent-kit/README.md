# ![AgentKit by Inngest](./.github/logo.png)

<p align="center">
    <a href="https://agentkit.inngest.com/overview">Documentation</a>
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

Below is an example of a [Network](https://agentkit.inngest.com/concepts/networks) of three [Agents](https://agentkit.inngest.com/concepts/agents):

```ts
import {
  createNetwork,
  createAgent,
  openai,
  anthropic,
} from "@inngest/agent-kit";

const navigator = createAgent({
  name: "Navigator",
  system: "You are a navigator...",
});

const classifier = createAgent({
  name: "Classifier",
  system: "You are a classifier...",
  model: openai("gpt-3.5-turbo"),
});

const summarizer = createAgent({
  name: "Summarizer",
  system: "You are a summarizer...",
  model: anthropic("claude-3-5-haiku-latest"),
});

// Create a network of agents with separate tasks and instructions
// to solve a specific task.
const network = createNetwork({
  agents: [navigator, classifier, summarizer],
  defaultModel: openai({ model: "gpt-4o" }),
});

const input = `Classify then summarize the latest 10 blog posts
  on https://www.deeplearning.ai/blog/`;

const result = await network.run(input);
```

The Network will dynamically route the input to the appropriate Agent based on provided `input` and current [Network State](https://agentkit.inngest.com/concepts/state).
AgentKit is flexible and allows for custom routing logic, tools, and the configuration of models at the Agent-level (_Mixture of Models_).

## Installation

You can install AgentKit via `npm` or similar:

```shell {{ title: "npm" }}
npm install @inngest/agent-kit inngest
```

Follow the [Getting Started](https://agentkit.inngest.com/getting-started/quick-start) guide to learn more about AgentKit.

## Documentation

The full Agent kit documentation is available
[here](https://www.inngest.com/docs/agent-kit/overview). You can also jump to
specific guides and references:

- [Agents and Tools](https://agentkit.inngest.com/concepts/agents)
- [Network, State, and Routing](https://agentkit.inngest.com/concepts/networks)

## Examples

See Agent kit in action in fully functioning example projects:

- [Hacker News Agent with Render and Inngest](https://github.com/inngest/agentkit-render-tutorial): A tutorial showing how to create a Hacker News Agent using AgentKit Code-style routing and Agents with tools.

- [AgentKit SWE-bench](https://github.com/inngest/agent-kit/tree/main/examples/swebench#readme): This AgentKit example uses the SWE-bench dataset to train an agent to solve coding problems. It uses advanced tools to interact with files and codebases.

## License

[Apache 2.0](LICENSE.md)
