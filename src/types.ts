import { Network } from "./network";
import { Agent } from "./agent";

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

export interface CallLifecycleArgs {
  agent: Agent,
  // Network represents the network that this agent or lifecycle belongs to.
  network?: Network;
}

export interface CallLifecycle {
  // TODO: Types
  before:  (args: CallLifecycleArgs) => Promise<any>
  after:   (args: CallLifecycleArgs & { result: any }) => Promise<any>
}

