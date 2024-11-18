import { Network } from "./network";
import { Agent } from "./agent";

export type Tool = {
  name: string;
  description?: string;
  parameters: any; // TODO: JSON Schema Type.
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

