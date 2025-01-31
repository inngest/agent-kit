/* eslint-disable */
import {
  anthropic,
  createAgent,
  createNetwork,
  createRoutingAgent,
  createServer,
  createTool,
} from "@inngest/agent-kit";
import { z } from "zod";

import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const writeFile = createTool({
  name: "writeFile",
  description: "Write a file to the filesystem",
  parameters: z.object({
    path: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  handler: async ({ path, content }) => {
    try {
      let relativePath = path.startsWith("/") ? path.slice(1) : path;
      writeFileSync(relativePath, content);
      return "File written";
    } catch (err) {
      console.error(`Error writing file ${path}:`, err);
      throw new Error(`Failed to write file ${path}`);
    }
  },
});

const readFile = createTool({
  name: "readFile",
  description: "Read a file from the filesystem",
  parameters: z.object({
    path: z.string().describe("The path to the file to read"),
  }),
  handler: async ({ path }) => {
    try {
      let relativePath = path.startsWith("/") ? path.slice(1) : path;
      const content = readFileSync(relativePath, "utf-8");
      return content;
    } catch (err) {
      console.error(`Error reading file ${path}:`, err);
      throw new Error(`Failed to read file ${path}`);
    }
  },
});

const searchCode = createTool({
  name: "searchCode",
  description: "Search for a given pattern in a project files",
  parameters: z.object({
    query: z.string().describe("The query to search for"),
  }),
  handler: async ({ query }) => {
    const searchFiles = (dir: string, searchQuery: string): string[] => {
      const results: string[] = [];

      const walk = (currentPath: string) => {
        const files = readdirSync(currentPath);

        for (const file of files) {
          const filePath = join(currentPath, file);
          const stat = statSync(filePath);

          if (stat.isDirectory()) {
            // Recursively search subdirectories
            walk(filePath);
          } else {
            // Search file contents
            try {
              const content = readFileSync(filePath, "utf-8");
              if (content.includes(searchQuery)) {
                results.push(filePath);
              }
            } catch (err) {
              console.error(`Error reading file ${filePath}:`, err);
            }
          }
        }
      };

      walk(dir);
      return results;
    };

    // Start search from current directory
    const matches = searchFiles(process.cwd(), query);

    if (matches.length === 0) {
      return "No matches found";
    }

    return `Found matches in following files:\n${matches.join("\n")}`;
  },
});

const plannerAgent = createAgent({
  name: "planner",
  system: "You are an expert in debugging TypeScript projects.",
  tools: [searchCode],
});

const editorAgent = createAgent({
  name: "editor",
  system: "You are an expert in fixing bugs in TypeScript projects.",
  tools: [writeFile, readFile],
});

const network = createNetwork({
  name: "code-assistant-v3",
  agents: [plannerAgent, editorAgent],
  defaultModel: anthropic({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 4096,
  }),
  defaultRouter: createRoutingAgent({
    name: "Code Assistant routing agent",
    lifecycle: {
      onRoute: ({ result }) => {
        const tool = result.toolCalls[0];
        if (!tool) {
          return;
        }
        const agentName =
          (tool.content as any).data || (tool.content as string);
        if (agentName === "finished") {
          return;
        } else {
          return [agentName];
        }
        return;
      },
    },

    tools: [
      createTool({
        name: "select_agent",
        description:
          "select an agent to handle the input, based off of the current conversation",
        parameters: z
          .object({
            name: z
              .string()
              .describe("The name of the agent that should handle the request"),
          })
          .strict(),
        handler: ({ name }, { network }) => {
          if (!network) {
            throw new Error(
              "The routing agent can only be used within a network of agents"
            );
          }

          if (typeof name !== "string") {
            throw new Error("The routing agent requested an invalid agent");
          }

          if (name === "finished") {
            return undefined;
          }

          const agent = network.agents.get(name);
          if (agent === undefined) {
            throw new Error(
              `The routing agent requested an agent that doesn't exist: ${name}`
            );
          }

          // This returns the agent name to call.  The default routing functon
          // schedules this agent by inpsecting this name via the tool call output.
          return agent.name;
        },
      }),
    ],

    tool_choice: "select_agent",

    system: async ({ network }): Promise<string> => {
      if (!network) {
        throw new Error(
          "The routing agent can only be used within a network of agents"
        );
      }

      const agents = await network?.availableAgents();

      return `You are the orchestrator between a group of agents.  Each agent is suited for a set of specific tasks, and has a name, instructions, and a set of tools.
      
      The following agents are available:
      <agents>
      ${agents
        .map((a) => {
          return `
        <agent>
          <name>${a.name}</name>
          <description>${a.description}</description>
          <tools>${JSON.stringify(Array.from(a.tools.values()))}</tools>
        </agent>`;
        })
        .join("\n")}
      </agents>
      
      Follow the set of instructions:
      
      <instructions>
      Think about the current history and status.
      If the user issue has been fixed, call select_agent with "finished"
      Otherwise, determine which agent to use to handle the user's request, based off of the current agents and their tools.
      
      Your aim is to thoroughly complete the request, thinking step by step, choosing the right agent based off of the context.
      </instructions>
        `;
    },
  }),
});

const server = createServer({
  networks: [network],
});

server.listen(3010, () => console.log("Agent kit running!"));
