import { State } from "@inngest/agent-kit";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { EventSchemas, Inngest } from "inngest";
import { z } from "zod";
import { AgentState, codeWritingNetwork } from "./networks/codeWritingNetwork";

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
    await step.run("clone repo", () => {
      // Check if the dir already exists.
      if (fs.existsSync(dir)) {
        return;
      }
      console.log("creating repo");
      fs.mkdirSync(dir, { recursive: true });
      execSync(`cd ${dir} && git init`);
      // use the `https` version so that we can pull without a pubkey.
      execSync(
        `cd ${dir} && git remote add origin https://github.com/${event.data.repo}.git`
      );
    });

    await step.run("check out commit", () => {
      console.log("checking out commit");
      execSync(
        `cd ${dir} && git fetch origin ${event.data.base_commit} --depth=1`
      );
      execSync(`cd ${dir} && git reset --hard FETCH_HEAD`);
    });

    // Create new state and store the repo in KV for access via tools.
    const state = new State<AgentState>({
      repo: event.data.repo,
      done: false,
    });

    await codeWritingNetwork.run(event.data.problem_statement, {
      state,
    });
  }
);
