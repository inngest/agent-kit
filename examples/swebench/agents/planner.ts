import { createAgent, createTool, type Tool } from "@inngest/agent-kit";
import { z } from "zod";
import {
  extractClassAndFnsTool,
  listFilesTool,
  readFileTool,
} from "../tools/tools";
import type { AgentState } from "../networks/codeWritingNetwork";

// Now that the setup has been completed, we can run the agent properly within that repo.
export const planningAgent = createAgent<AgentState>({
  name: "Planner",
  description: "Plans the code to write and which files should be edited",
  tools: [
    listFilesTool,
    readFileTool,
    extractClassAndFnsTool,
    createTool({
      name: "create_plan",
      description:
        "Describe a formal plan for how to fix the issue, including which files to edit and reasoning.",
      parameters: z.object({
        thoughts: z.string(),
        plan_details: z.string(),
        edits: z.array(
          z.object({
            filename: z.string(),
            idea: z.string(),
            reasoning: z.string(),
          })
        ),
      }),

      handler: async (plan, opts:  Tool.Options<AgentState>) => {
        // Store this in the function state for introspection in tracing.
        await opts.step?.run("plan created", () => plan);
        if (opts.network) {
          opts.network.state.data.plan = plan;
        }
      },
    }),
  ],

  system: ({ network }) => `
    You are an expert Python programmer working on a specific project: ${network?.state.data.repo}.

    You are given an issue reported within the project.  You are planning how to fix the issue by investigating the report,
    the current code, then devising a "plan" - a spec - to modify code to fix the issue.

    Your plan will be worked on and implemented after you create it.   You MUST create a plan to
    fix the issue.  Be thorough. Think step-by-step using available tools.

    Techniques you may use to create a plan:
    - Read entire files
    - Find specific classes and functions within a file
  `,
});
