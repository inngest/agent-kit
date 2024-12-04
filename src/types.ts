import { type output as ZodOutput } from "zod";
import { type Agent } from "./agent";
import { type Network } from "./network";
import { type InferenceResult, type InternalNetworkMessage } from "./state";
import { type AnyZodType, type MaybePromise } from "./util";

export type Tool<T extends AnyZodType> = {
  name: string;
  description?: string;
  parameters: T;

  // TODO: Handler input types based off of JSON above.
  //
  // Handlers get their input arguments from inference calls, and can also
  // access the current agent and network.  This allows tools to reference and
  // schedule future work via the network, if necessary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: ZodOutput<T>, opts: ToolHandlerArgs) => MaybePromise<any>;
};

export namespace Tool {
  export type Any = Tool<AnyZodType>;
}

export type ToolHandlerArgs = {
  agent: Agent;
  network?: Network;
  // step: GetStepTools<Inngest.Any>;
};

export interface BaseLifecycleArgs {
  // Agent is the agent that made the call.
  agent: Agent;
  // Network represents the network that this agent or lifecycle belongs to.
  network?: Network;
}

export interface ResultLifecycleArgs extends BaseLifecycleArgs {
  result: InferenceResult;
}

export interface BeforeLifecycleArgs extends BaseLifecycleArgs {
  // input is the user request for the entire agentic operation.
  input?: string;
  system: InternalNetworkMessage[];
  history?: InternalNetworkMessage[];
}
