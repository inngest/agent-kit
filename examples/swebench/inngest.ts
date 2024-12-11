/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from "fs";
import { execSync } from 'child_process';
import { z } from "zod";
import {
  createAgent,
  createNetwork,
  createTool,
  anthropic,
  State,
} from "../../src/index";
import { extractClassAndFns, listFilesTool, readFileTool, replaceClassMethodTool } from "./tools/tools";
import { Inngest, EventSchemas } from "inngest";

export const inngest = new Inngest({
  id: "agents",
  schemas: new EventSchemas().fromZod({
    "swebench/run": {
      data: z.object({
        repo: z.string(),
        base_commit: z.string(),
        environment_setup_commit: z.string(),
        problem_statement: z.string(),
      })
    },
  }),
});

export const fn = inngest.createFunction(
  { id: "agent", retries: 2, },
  { event: "swebench/run" },
  async ({ event, step }) => {

    // This is some basic stuff to initialize and set up the repos
    // for the swebench test.
    //
    // First, we clone the repo, then we ensure we're on the correct base commit.
    const dir = `./opt/${event.data.repo}`;
    await step.run("clone repo", async () => {
      // Check if the dir already exists.
      if (fs.existsSync(dir)) {
        return
      }
      console.log("creating repo");
      fs.mkdirSync(dir, { recursive: true });
      execSync(`cd ${dir} && git init`);
      execSync(`cd ${dir} && git remote add origin git@github.com:${event.data.repo}.git`);
    });

    await step.run("check out commit", async () => {
      console.log("checking out commit");
      execSync(`cd ${dir} && git fetch origin ${event.data.base_commit} --depth=1`);
      execSync(`cd ${dir} && git reset --hard FETCH_HEAD`);
    });


    const model = anthropic({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1000,
      step: step as any,
    });

    const state = new State();
    state.kv.set("repo", event.data.repo);

    const network = createNetwork({
      agents: [planningAgent.withModel(model), editingAgent.withModel(model)],
      defaultModel: model,
      state,
    });
    await network.run(event.data.problem_statement, (opts) => {
      if (opts.network.state.kv.get("done")) {
        // We're done editing.
        return;
      }

      if (opts.network.state.kv.get("plan") !== undefined) {
        return editingAgent.withModel(model);
      }
      return planningAgent.withModel(model);
    });
  },
);

// Now that the setup has been completed, we can run the agent properly within that repo.
const planningAgent = createAgent({
  name: "Planner",
  description: "Plans the code to write and which files should be edited",
  tools: [
    listFilesTool,
    readFileTool,
    extractClassAndFns,

    createTool({
      name: "create_plan",
      description: "Describe a formal plan for how to fix the issue, including which files to edit and reasoning.",
      parameters: z.object({
        thoughts: z.string(),
        plan_details: z.string(),
        edits: z.array(z.object({
          filename: z.string(),
          idea: z.string(),
          reasoning: z.string(),
        }))
      }),

      handler: async (plan, opts) => {
        // Store this in the function state for introspection in tracing.
        await opts.step.run("plan created", () => plan);
        opts.network?.state.kv.set("plan", plan);
      },
    }),
  ],

  system: (network) => `
    You are an expert Python programmer working on a specific project: ${network?.state.kv.get("repo")}.

    You are given an issue reported within the project.  You are planning how to fix the issue by investigating the report,
    the current code, then devising a "plan" - a spec - to modify code to fix the issue.

    Your plan will be worked on and implemented after you create it.   You MUST create a plan to
    fix the issue.  Be thorough. Think step-by-step using available tools.

    Techniques you may use to create a plan:
    - Read entire files
    - Find specific classes and functions within a file
  `,
})

/**
 * the editingAgent is enabled once a plan has been written.  It disregards all conversation history
 * and uses the plan from the current network state to construct a system prompt to edit the given
 * files to resolve the input.
 */
const editingAgent = createAgent({
  name: "Editor",
  description: "Edits code by replacing contents in files, or creating new files with new code.",
  tools: [
    extractClassAndFns,
    replaceClassMethodTool,
    readFileTool,

    createTool({
      name: "done",
      description: "Saves the current project and finishes editing",
      handler: (_input, opts) => {
        opts.network?.state.kv.delete("plan");
        opts.network?.state.kv.set("done", true);
        return "Done editing";
      },
    }),
  ],
  lifecycle: {

    // The editing agent is only enabled once we have a plan.
    enabled: (opts) => {
      return opts.network?.state.kv.get("plan") !== undefined;
    },

    // onStart is called when we start inference.  We want to update the history here to remove
    // things from the planning agent.  We update the system prompt to include details from the
    // plan via network state.
    onStart: ({ agent, prompt, network }) => {

      const history = (network?.state.results || []).
        filter(i => i.agent === agent). // Return the current history from this agent only.
        map(i => i.output.concat(i.toolCalls)). // Only add the output and tool calls to the conversation history
        flat();

      return { prompt, history, stop: false };
    },
  },

  system: (network) => `
    You are an expert Python programmer working on a specific project: ${network?.state.kv.get("repo")}.  You have been
    given a plan to fix the given issue supplied by the user.

    The current plan is:
    <plan>
      ${JSON.stringify(network?.state.kv.get("plan"))}
    </plan>

    You MUST:
      - Understand the user's request
      - Understand the given plan
      - Write code using the tools available to fix the issue

    Once the files have been edited and you are confident in the updated code, you MUST finish your editing via calling the "done" tool.
  `,
})
