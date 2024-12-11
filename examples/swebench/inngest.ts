import fs from "fs";
import { execSync } from "child_process";
import { Inngest, EventSchemas } from "inngest";
import { z } from "zod";
import { planningAgent } from "./agents/planner";
import { editingAgent } from "./agents/editor";
import { codeWritingNetwork } from "./networks/codeWritingNetwork";

export const inngest = new Inngest({
  id: "agents",
  schemas: new EventSchemas().fromZod({
    "swebench/run": {
      data: z.object({
        repo: z.string(),
        base_commit: z.string(),
        environment_setup_commit: z.string(),
        problem_statement: z.string(),
      }),
    },
  }),
});

export const fn = inngest.createFunction(
  { id: "agent", retries: 2 },
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
        return;
      }
      console.log("creating repo");
      fs.mkdirSync(dir, { recursive: true });
      execSync(`cd ${dir} && git init`);
      execSync(
        `cd ${dir} && git remote add origin git@github.com:${event.data.repo}.git`
      );
    });

    await step.run("check out commit", async () => {
      console.log("checking out commit");
      execSync(
        `cd ${dir} && git fetch origin ${event.data.base_commit} --depth=1`
      );
      execSync(`cd ${dir} && git reset --hard FETCH_HEAD`);
    });

    await codeWritingNetwork.run(event.data.problem_statement, {
      state: { repo: event.data.repo },
      router: (opts) => {
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
      },
    });
  }
);
