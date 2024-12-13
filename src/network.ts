import { type AiAdapter } from "inngest";
import { z } from "zod";
import { createRoutingAgent, type Agent, type RoutingAgent } from "./agent";
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

  defaultRouter?: Network.Router;

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
    agents,
    defaultModel,
    maxIter,
    defaultState,
    defaultRouter,
  }: Network.Constructor) {
    this.agents = new Map();
    this._agents = new Map();
    this.defaultModel = defaultModel;
    this.defaultRouter = defaultRouter;
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
    networkRun: NetworkRun = new NetworkRun(this, new State()),
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

/**
 * defaultRoutingAgent is an AI agent that selects the appropriate agent from
 * the network to handle the incoming request.
 *
 * It is no set model and so relies on the presence of a default model in the
 * network or being explicitly given one.
 */
let defaultRoutingAgent: RoutingAgent | undefined;
export const getDefaultRoutingAgent = () => {
  defaultRoutingAgent ??= createRoutingAgent({
    name: "Default routing agent",

    description:
      "Selects which agents to work on based off of the current prompt and input.",

    lifecycle: {
      onRoute: ({ result }) => {
        const tool = result.toolCalls[0];
        if (!tool) {
          return;
        }
        if (typeof tool.content === "string") {
          return [tool.content];
        }
        return;
      },
    },

    tools: [
      // This tool does nothing but ensure that the model responds with the
      // agent name as valid JSON.
      {
        name: "select_agent",
        description:
          "select an agent to handle the input, based off of the current conversation",
        parameters: z
          .object({
            name: z
              .string()
              .describe("The name of the agent that should handle the request"),
          })
          .strict(),
        handler: ({ name }, { network }) => {
          if (!network) {
            throw new Error(
              "The routing agent can only be used within a network of agents",
            );
          }

          if (typeof name !== "string") {
            throw new Error("The routing agent requested an invalid agent");
          }

          const agent = network.agents.get(name);
          if (agent === undefined) {
            throw new Error(
              `The routing agent requested an agent that doesn't exist: ${name}`,
            );
          }

          // This returns the agent name to call.  The default routing functon
          // schedules this agent by inpsecting this name via the tool call output.
          return agent.name;
        },
      },
    ],

    tool_choice: "select_agent",

    system: async ({ network }): Promise<string> => {
      if (!network) {
        throw new Error(
          "The routing agent can only be used within a network of agents",
        );
      }

      const agents = await network?.availableAgents();

      return `You are the orchestrator between a group of agents.  Each agent is suited for a set of specific tasks, and has a name, instructions, and a set of tools.

The following agents are available:
<agents>
  ${agents
    .map((a) => {
      return `
    <agent>
      <name>${a.name}</name>
      <description>${a.description}</description>
      <tools>${JSON.stringify(Array.from(a.tools.values()))}</tools>
    </agent>`;
    })
    .join("\n")}
</agents>

Follow the set of instructions:

<instructions>
  Think about the current history and status.  Determine which agent to use to handle the user's request, based off of the current agents and their tools.

  Your aim is to thoroughly complete the request, thinking step by step, choosing the right agent based off of the context.
</instructions>
    `;
    },
  });

  return defaultRoutingAgent;
};

export namespace Network {
  export type Constructor = {
    agents: Agent[];
    defaultModel?: AiAdapter.Any;
    maxIter?: number;
    // state is any pre-existing network state to use in this Network instance.  By
    // default, new state is created without any history for every Network.
    defaultState?: State;
    defaultRouter?: Router;
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
      args: Args,
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
