import { Network } from "./network";
import { Agent } from "./agent";
import { AgenticCall, Message } from "./state";

export type Tool = {
  name: string;
  description?: string;
  parameters: any; // TODO: JSON Schema Type.

  // TODO: Handler input types based off of JSON above.
  //
  // Handlers get their input arguments from inference calls, and can also access
  // the current agent and network.  This allows tools to reference and schedule
  // future work via the network, if necessary.
  handler: (input: { [key: string]: any }, agent: Agent, network?: Network) => Promise<any>;
};

export interface BaseLifecycleArgs {
  // Agent is the agent that made the call.
  agent: Agent,
  // Network represents the network that this agent or lifecycle belongs to.
  network?: Network;
}

export interface ResultLifecycleArgs extends BaseLifecycleArgs {
  call: AgenticCall;
}

export interface BeforeLifecycleArgs extends BaseLifecycleArgs {
  // input is the user request for the entire agentic operation.
  input?: string;
  instructions: Message[];
  history?: Message[];
}

export interface InferenceLifecycle {
  /**
   * Before allows you to intercept and modify the input prompt for a given agent,
   * or prevent the agent from being called altogether by throwing an error.
   *
   * This receives the full agent prompt.  If this is a networked agent, the agent
   * will also receive the network's history which will be concatenated to the end
   * of the prompt when making the inference request.
   *
   */
  before?: (args: BeforeLifecycleArgs) => Promise<{ instructions: Message[], history: Message[] }>

  /**
   * afterInfer is called after the inference call finishes, before any tools have been invoked.
   * This allows you to moderate the response prior to running tools.
   */
  afterInfer?: (args: ResultLifecycleArgs) => Promise<AgenticCall>

  /**
   * afterTools is called after an agent invokes tools as specified by the inference call. The
   * returned AgenticCall will be saved to network history, if the agent is part of the network.
   *
   */
  afterTools?: (args: ResultLifecycleArgs) => Promise<AgenticCall>
}
