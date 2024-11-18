import { Network } from "./network";
import { Agent } from "./agent";

// TODO
export type Tool = any;   

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

