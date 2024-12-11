/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from "fs";
import { execSync } from 'child_process';
import {
  createNetwork,
  State,
} from "@inngest/agent-kit";
import { Inngest, EventSchemas, anthropic } from "inngest";
import { z } from "zod";
import { planningAgent } from "./agents/planner";
import { editingAgent } from "./agents/editor";

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

    // Use Claude as the base model of the network.
    const model = anthropic({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1000,
    });

    // Create new network state, and set the repo we're editing directly from the event
    // input.
    const state = new State();
    state.kv.set("repo", event.data.repo);

    const network = createNetwork({
      agents: [planningAgent, editingAgent],
      defaultModel: model,
      state,
    });
    await network.run(event.data.problem_statement, (opts) => {
      if (opts.network.state.kv.get("done")) {
        // We're done editing.  This is set when the editing agent finishes
        // implementing the plan.
        //
        // At this point, we should hand off to another agent that tests, critiques,
        // and validates the edits.
        return;
      }

      // If there's a plan, we should switch to the editing agent to begin implementing.
      // 
      // This lets us separate the concerns of planning vs editing, including using differing
      // prompts and tools at various stages of the editing process.
      if (opts.network.state.kv.get("plan") !== undefined) {
        return editingAgent;
      }

      // By default, use the planning agent.
      return planningAgent;
    });
  },
);
