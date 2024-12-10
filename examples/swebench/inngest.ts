/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from "fs";
import { execSync } from 'child_process';
import {
  createAgent,
  createNetwork,
  createTool,
  defaultRoutingAgent,
  openai,
  anthropic,
  State,
} from "../../src/index";
import { Inngest, EventSchemas } from "inngest";
import { z } from "zod";

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
      step: step as any, // TODO: typing
    });

    const state = new State();
    state.kv.set("repo", event.data.repo);

    console.log("running network");

    const network = createNetwork({
      agents: [planningAgent.withModel(model), editingAgent.withModel(model)],
      defaultModel: model,
      state,
    });
    await network.run(event.data.problem_statement);
  },
);

// Now that the setup has been completed, we can run the agent properly within that repo.
const planningAgent = createAgent({
  name: "Planner",
  description: "Plans the code to write and which files should be edited",
  tools: [

    createTool({
      name: "list_files",
      description: "Lists all files within the project, returned as a JSON string containign the path to each file",
      handler: async (_input, opts) => {
        // NOTE:  In this repo, all files are stored in "./opt/" as the prefix.
        const path = "./opt/" + opts.network?.state.kv.get("repo")
        const files = await opts.step.run("read files", () => fs.readdirSync(path, { recursive: true }));
        opts.network && opts.network.state.kv.set("files", files);
        return files;
      },
    }),

    createTool({
      name: "read_file",
      description: "Reads a single file given its filename, returning its contents",
      parameters: z.object({
        filename: z.string(),
      }),
      handler: async ({ filename }, opts) => {
        // NOTE:  In this repo, all files are stored in "./opt/" as the prefix.
        const path = "./opt/" + opts.network?.state.kv.get("repo")
        const content = await opts.step.run(`list file: ${filename}`, () => {
          return fs.readFileSync(path + "/" + filename).toString();
        })

        // Set state for the filename.
        opts.network?.state.kv.set("file:" + filename, content);
        return content;
      },
    }),

    createTool({
      name: "create_plan",
      description: "Describe a formal plan for how to fix the issue.  Describe the plan.  Describe which files to edit.  Including reasoning.",
      parameters: z.object({
        description: z.string(),
        reasoning: z.string(),
        edit_files: z.array(z.string()).describe("The filenames to edit"),
      }),

      handler: async (plan, opts) => {
        // Store this in the function state for introspection in tracing.
        await opts.step.run("plan created", () => plan);
        opts.network?.state.kv.set("plan", plan);
      },
    })
  ],

  system: (network) => `
    You are an expert Python programmer working on a specific project: ${network?.state.kv.get("repo")}.

    You are given an issue reported within the project.  You are planning how to fix the issue by investigating the report,
    the current code, then devising a "plan" - a spec - to modify code to fix the issue.

    Your plan will be worked on and implemented after you create it.   You MUST create a plan to
    fix the issue.  Be thorough. Think step-by-step using available tools.
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
    createTool({
      name: "patch_file",
      description: "Updates the contents of a single file.  This replaces existing contents in the given line ranges with new content provided.  The line numbers are 1-indexed, starting at 1.",
      parameters: z.object({
        filename: z.string(),
        content: z.string(),
        line_range_start: z.number(),
        line_range_end: z.number(),
      }),
      handler: async ({ filename, content, line_range_start, line_range_end }, opts) => {
        // NOTE:  In this repo, all files are stored in "./opt/" as the prefix.
        const path = "./opt/" + opts.network?.state.kv.get("repo")
        const lines = fs.readFileSync(path + "/" + filename).toString().split("\n");

        const updated = lines.reduce((updated, line, idx) => {
          const beforeRange = idx < (line_range_start-1);
          const isRange = idx === (line_range_start-1);
          const afterRange = idx >= (line_range_end);

          if (beforeRange || afterRange) {
            return [...updated, line];
          }

          return isRange ? [...updated, content] : updated;
        }, [] as string[]).join("\n");

        await opts.step.run("updated content", () => updated);

        fs.writeFileSync(path + "/" + filename, updated);

        // TODO: Mark the plan as done.

        return updated;
      },
    }),
  ],
  lifecycle: {
    enabled: (opts) => {
      // The editing agent is only enabled once we have a plan.
      return opts.network?.state.kv.get("plan") !== undefined;
    },
    onStart: ({ prompt }) => {
      // Do not return the current history.
      return { prompt, history: [], stop: false };
    },
  },
  system: (network) => `
    You are an expert Python programmer working on a specific project: ${network?.state.kv.get("repo")}.  You have been
    given a plan to fix the given issue supplied by the user.

    The current plan is:
    <plan>
      ${JSON.stringify(network?.state.kv.get("plan"))}
    </plan>

    The content for each file to edit in the plan:
    ${(network?.state.kv.get("plan")?.edit_files || []).forEach((filename: string) => {
      return `<content filename="${filename}">${network?.state.kv.get("file:" + filename)}</content>\n`;
    })}

    You MUST:
      - Understand the user's request
      - Understand the given plan
      - Write code using the tools available to fix the issue
  `,
})
