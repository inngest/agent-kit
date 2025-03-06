import { type AiAdapter } from "@inngest/ai";
import { type Agent, type RoutingAgent } from "./agent";
import { NetworkRun } from "./networkRun";
import { State, type InferenceResult } from "./state";
import { type MaybePromise } from "./util";

/**
 * Network represents a network of agents.
 */
export const createNetwork = (opts: Network.Constructor) => new Network(opts);

/**
 * Network represents a network of agents.
 */
export class Network {
  /**
   * The name for the system of agents
   */
  name: string;

  description?: string;

  /**
   * agents are all publicly available agents in the netwrok
   */
  agents: Map<string, Agent>;

  /**
   * state is the entire agent's state.
   */
  defaultState?: State;

  /**
   * defaultModel is the default model to use with the network.  This will not
   * override an agent's specific model if the agent already has a model defined
   * (eg. via withModel or via its constructor).
   */
  defaultModel?: AiAdapter.Any;

  /**
   * @deprecated Use `router` instead
   */
  defaultRouter?: Network.Router;

  router: Network.Router;

  /**
   * maxIter is the maximum number of times the we can call agents before ending
   * the network's run loop.
   */
  maxIter: number;

  // _stack is an array of strings, each representing an agent name to call.
  protected _stack: string[];

  protected _counter = 0;

  // _agents atores all egents.  note that you may not include eg. the
  // defaultRoutingAgent within the network constructor, and you may return an
  // agent in the router that's not included.  This is okay;  we store all
  // agents referenced in the router here.
  protected _agents: Map<string, Agent>;

  constructor({
    name,
    description,
    agents,
    defaultModel,
    maxIter,
    defaultState,
    defaultRouter,
    router,
  }: Network.Constructor) {
    this.name = name;
    this.description = description;
    this.agents = new Map();
    this._agents = new Map();
    this.defaultModel = defaultModel;
    this.router = router || defaultRouter;
    this.maxIter = maxIter || 0;
    this._stack = [];

    if (defaultState) {
      this.defaultState = defaultState;
    }

    for (const agent of agents) {
      // Store all agents publicly visible.
      this.agents.set(agent.name, agent);
      // Store an internal map of all agents referenced.
      this._agents.set(agent.name, agent);
    }
  }

  async availableAgents(
    networkRun: NetworkRun = new NetworkRun(this, new State())
  ): Promise<Agent[]> {
    const available: Agent[] = [];
    const all = Array.from(this.agents.values());
    for (const a of all) {
      const enabled = a?.lifecycles?.enabled;
      if (!enabled || (await enabled({ agent: a, network: networkRun }))) {
        available.push(a);
      }
    }
    return available;
  }

  /**
   * addAgent adds a new agent to the network.
   */
  addAgent(agent: Agent) {
    this.agents.set(agent.name, agent);
  }

  /**
   * run handles a given request using the network of agents.  It is not
   * concurrency-safe; you can only call run on a network once, as networks are
   * stateful.
   *
   */
  public run(...[input, overrides]: Network.RunArgs): Promise<NetworkRun> {
    let state: State;
    if (overrides?.state) {
      if (overrides.state instanceof State) {
        state = overrides.state;
      } else {
        state = new State(overrides.state);
      }
    } else {
      state = this.defaultState?.clone() || new State();
    }

    return new NetworkRun(this, state)["execute"](input, overrides);
  }
}

export namespace Network {
  export type Constructor = {
    name: string;
    description?: string;
    agents: Agent[];
    defaultModel?: AiAdapter.Any;
    maxIter?: number;
    // state is any pre-existing network state to use in this Network instance.  By
    // default, new state is created without any history for every Network.
    defaultState?: State;
    /**
     * @deprecated Use `router` instead
     */
    defaultRouter?: Router;
    router: Router;
  };

  export type RunArgs = [
    input: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overrides?: { router?: Router; state?: State | Record<string, any> },
  ];

  /**
   * Router defines how a network coordinates between many agents.  A router is
   * either a RoutingAgent which uses inference calls to choose the next Agent,
   * or a function which chooses the next Agent to call.
   *
   * The function gets given the network, current state, future
   * agentic calls, and the last inference result from the network.
   *
   */
  export type Router = RoutingAgent | Router.FnRouter;

  export namespace Router {
    /**
     * FnRouter defines a function router which returns an Agent, an AgentRouter, or
     * undefined if the network should stop.
     *
     * If the FnRouter returns an AgentRouter (an agent with the .route function),
     * the agent will first be ran, then the `.route` function will be called.
     *
     */
    export type FnRouter = (
      args: Args
    ) => MaybePromise<RoutingAgent | Agent | Agent[] | undefined>;

    export interface Args {
      /**
       * input is the input called to the network
       */
      input: string;

      /**
       * Network is the network that this router is coordinating.  Network state
       * is accessible via `network.state`.
       */
      network: NetworkRun;

      /**
       * stack is an ordered array of agents that will be called next.
       */
      stack: Agent[];

      /**
       * callCount is the number of current agent invocations that the network
       * has made.  This is a shorthand for `network.state.results.length`.
       */
      callCount: number;

      /**
       * lastResult is the last inference result that the network made.  This is
       * a shorthand for `network.state.results.pop()`.
       */
      lastResult?: InferenceResult;
    }
  }
}
