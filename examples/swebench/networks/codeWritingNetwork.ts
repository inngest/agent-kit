import { createNetwork } from "@inngest/agent-kit";
import { anthropic } from "inngest";
import { editingAgent } from "../agents/editor";
import { planningAgent } from "../agents/planner";

export interface AgentState {
  // repo is the repository name that the agent is modifying.  This
  // is set before launching the network.
  repo: string;

  // done indicates whether we're done editing files, and terminates the
  // network when true.
  done: boolean;

  // files stores all files that currently exist in the repo.
  files?: string[];

  // plan is the plan created by the planning agent.  It is optional
  // as, to begin with, there is no plan.  This is set by the planning
  // agent's tool.
  plan?: {
    thoughts: string;
    plan_details: string;
    edits: Array<{
      filename: string;
      idea: string;
      reasoning: string;
    }>;
  },
}

export const codeWritingNetwork = createNetwork({
  name: "Code writing network",
  agents: [planningAgent, editingAgent],
  // Use Claude as the base model of the network.
  defaultModel: anthropic({
    model: "claude-3-5-haiku-latest",
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
  defaultRouter: ({ network }) => {
    if (network.state.data.done) {
      // We're done editing.  This is set when the editing agent finishes
      // implementing the plan.
      //
      // At this point, we could hand off to another agent that tests, critiques,
      // and validates the edits.  For now, return undefined to signal that
      // the network has finished.
      return;
    }

    // By default, there is no plan and we should use the planning agent to read and
    // understand files.  The planning agent's `create_plan` tool modifies state once
    // it's gathered enough context, which will then cause the router loop to pass
    // to the editing agent below.
    if (network.state.data.plan === undefined) {
      return planningAgent;
    }

    // There is a plan, so switch to the editing agent to begin implementing.
    //
    // This lets us separate the concerns of planning vs editing, including using differing
    // prompts and tools at various stages of the editing process.
    return editingAgent;
  },
});
