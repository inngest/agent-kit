/* eslint-disable */
import { z } from "zod";
import {
  anthropic,
  createAgent,
  createNetwork,
  createTool,
} from "@inngest/agent-kit";

import { readFileSync } from "fs";
import { join } from "path";

const saveSuggestions = createTool({
  name: "save_suggestions",
  description: "Save the suggestions made by other agents into the state",
  parameters: z.object({
    suggestions: z.array(z.string()),
  }),
  handler: async (input, { network }) => {
    const suggestions = network?.state.kv.get("suggestions") || [];
    network?.state.kv.set("suggestions", [
      ...suggestions,
      ...input.suggestions,
    ]);
    return "Suggestions saved!";
  },
});

const documentationAgent = createAgent({
  name: "documentation_agent",
  system: "You are an expert at generating documentation for code",
  tools: [saveSuggestions],
});

const analysisAgent = createAgent({
  name: "analysis_agent",
  system: "You are an expert at analyzing code and suggesting improvements",
  tools: [saveSuggestions],
});

const summarizationAgent = createAgent({
  name: "summarization_agent",
  system: ({ network }) => {
    const suggestions = network?.state.kv.get("suggestions") || [];
    return `Save a summary of the following suggestions:
    ${suggestions.join("\n")}`;
  },
  tools: [
    createTool({
      name: "save_summary",
      description:
        "Save a summary of the suggestions made by other agents into the state",
      parameters: z.object({
        summary: z.string(),
      }),
      handler: async (input, { network }) => {
        network?.state.kv.set("summary", input.summary);
        return "Saved!";
      },
    }),
  ],
});

// Create the code assistant agent
const codeAssistantAgent = createAgent({
  name: "code_assistant_agent",
  system: ({ network }) => {
    const agents = Array.from(network?.agents.values() || [])
      .filter(
        (agent) =>
          !["code_assistant_agent", "summarization_agent"].includes(agent.name)
      )
      .map((agent) => `${agent.name} (${agent.system})`);
    return `From a given user request, ONLY perform the following tool calls:
- read the file content
- generate a plan of agents to run from the following list: ${agents.join(", ")}

Answer with "done" when you are finished.`;
  },
  tools: [
    createTool({
      name: "read_file",
      description: "Read a file from the current directory",
      parameters: z.object({
        filename: z.string(),
      }),
      handler: async (input, { network }) => {
        const filePath = join(process.cwd(), `files/${input.filename}`);
        const code = readFileSync(filePath, "utf-8");
        network?.state.kv.set("code", code);
        return "File read!";
      },
    }),
    createTool({
      name: "generate_plan",
      description: "Generate a plan of agents to run",
      parameters: z.object({
        plan: z.array(z.string()),
      }),
      handler: async (input, { network }) => {
        network?.state.kv.set("plan", input.plan);
        return "Plan generated!";
      },
    }),
  ],
});

const network = createNetwork({
  name: "code-assistant-v2",
  agents: [
    codeAssistantAgent,
    documentationAgent,
    analysisAgent,
    summarizationAgent,
  ],
  defaultRouter: ({ network }) => {
    if (!network?.state.kv.has("code") || !network?.state.kv.has("plan")) {
      return codeAssistantAgent;
    } else {
      const plan = (network?.state.kv.get("plan") || []) as string[];
      const nextAgent = plan.pop();
      if (nextAgent) {
        network?.state.kv.set("plan", plan);
        return network?.agents.get(nextAgent);
      } else if (!network?.state.kv.has("summary")) {
        return summarizationAgent;
      } else {
        return undefined;
      }
    }
  },
  defaultModel: anthropic({
    model: "claude-3-5-sonnet-latest",
    defaultParameters: {
      max_tokens: 4096,
    },
  }),
});

async function main() {
  const {
    state: { kv },
  } = await network.run(
    `Analyze the files/example.ts file by suggesting improvements and documentation.`
  );
  console.log("Analysis:", kv.get("summary"));
}

main();

// Analysis: The code analysis suggests several key areas for improvement:

// 1. Type Safety and Structure:
// - Implement strict TypeScript configurations
// - Add explicit return types and interfaces
// - Break down complex functions
// - Follow Single Responsibility Principle
// - Implement proper error handling

// 2. Performance Optimization:
// - Review and optimize critical operations
// - Consider caching mechanisms
// - Improve data processing efficiency

// 3. Documentation:
// - Add comprehensive JSDoc comments
// - Document complex logic and assumptions
// - Create detailed README
// - Include setup and usage instructions
// - Add code examples
