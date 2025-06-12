import { type Agent } from "./agent";
import { type NetworkRun } from "./network";
import { type State, type StateData } from "./state";
import { type AgentResult } from "./types";
import { type GetStepTools, type Inngest } from "inngest";

/**
 * History configuration for managing conversation history in agents and networks.
 */
export interface HistoryConfig<T extends StateData> {
  /**
   * get is called to load initial conversation history.
   * If provided, any results passed to createState will be ignored in favor
   * of the history loaded by this function.
   */
  get?: (ctx: History.Context<T>) => Promise<AgentResult[]>;

  /**
   * appendResults is called to persist new results generated during the current
   * network/agent run. It only receives new results, not including any that
   * were loaded via history.get().
   */
  appendResults?: (
    ctx: History.Context<T> & { newResults: AgentResult[] }
  ) => Promise<void>;
}

export namespace History {
  /**
   * Context provides access to the current state and execution context
   * when history hooks are called.
   */
  export type Context<T extends StateData> = {
    state: State<T>;
    network?: NetworkRun<T>;
    step?: GetStepTools<Inngest.Any>;
  };

  /**
   * Config is an alias for HistoryConfig for consistency with other namespaces
   */
  export type Config<T extends StateData> = HistoryConfig<T>;
} 