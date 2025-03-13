import { createNetwork } from "@inngest/agent-kit";
import { anthropic } from "inngest";
import { editingAgent } from "../agents/editor";
import { planningAgent } from "../agents/planner";

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
  router: ({ network }) => {
    if (network.state.kv.get("done")) {
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
    if (network.state.kv.get("plan") !== undefined) {
      return editingAgent;
    }

    // By default, use the planning agent.
    return planningAgent;
  },
});
