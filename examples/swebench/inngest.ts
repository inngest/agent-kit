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
      step: step as any,
    });

    const state = new State();
    state.kv.set("repo", event.data.repo);

    console.log("running network");

    const network = createNetwork({
      agents: [planningAgent.withModel(model)],
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
      description: "Lists all files within the project, returned as a JSON string",
      handler: (_input, opts) => {
        const files = fs.readdirSync(opts.network?.state.kv.get("repo") || "./", { recursive: true });
        opts.network && opts.network.state.kv.set("files", files);
        return files;
      },
    }),
  ],

  system: (network) => `
    You are an expert Python programmer working on a specific project: ${network?.state.kv.get("repo")}.

    You are given an issue reported within the project.  You must fix this issue by writing code within the project.

    You must:

    1. Understand the reported issue
    2. Write code to fix the given issue
  `,
})
