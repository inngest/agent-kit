import { createNetwork } from "@inngest/agent-kit";
import { editingAgent } from "../agents/editor";
import { planningAgent } from "../agents/planner";
import { anthropic } from "inngest";

export const codeWritingNetwork = createNetwork({
  agents: [planningAgent, editingAgent],
  // Use Claude as the base model of the network.
  defaultModel: anthropic({
    model: "claude-3-5-haiku-latest",
    max_tokens: 1000,
  }),
});
