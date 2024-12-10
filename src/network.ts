import { z } from "zod";
import { Agent, createTool } from "./agent";
import { type InferenceResult, State } from "./state";
import { type MaybePromise } from "./util";
import { type AiAdapter } from "inngest";

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
  state: State;

  /**
   * defaultModel is the default model to use with the network.  This will not
   * override an agent's specific model if the agent already has a model defined
   * (eg. via withModel or via its constructor).
   */
  defaultModel?: AiAdapter.Any;

  /**
   * maxIter is the maximum number of times the we can call agents before ending
   * the network's run loop.
   */
  maxIter: number;

  // _stack is an array of strings, each representing an agent name to call.
  private _stack: string[];

  private _counter = 0;

  // _agents atores all egents.  note that you may not include eg. the
  // defaultRoutingAgent within the network constructor, and you may return an
  // agent in the router that's not included.  This is okay;  we store all
  // agents referenced in the router here.
  private _agents: Map<string, Agent>;

  constructor({
    agents,
    defaultModel,
    maxIter,
    state = new State(),
  }: Network.Constructor) {
    this.agents = new Map();
    this._agents = new Map();
    this.state = state;
    this.defaultModel = defaultModel;
    this.maxIter = maxIter || 0;
    this._stack = [];

    for (const agent of agents) {
      // Store all agents publicly visible.
      this.agents.set(agent.name, agent);
      // Store an internal map of all agents referenced.
      this._agents.set(agent.name, agent);
    }
  }

  async availableAgents(): Promise<Agent[]> {
    const available: Agent[] = [];
    const all = Array.from(this.agents.values());
    for (const a of all) {
      const enabled = a?.lifecycles?.enabled;
      if (!enabled || (await enabled({ agent: a, network: this }))) {
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
   * Schedule is used to push an agent's run function onto the stack.
   */
  schedule(agentName: string) {
    this._stack.push(agentName);
  }

  /**
   * run handles a given request using the network of agents.  It is not
   * concurrency-safe; you can only call run on a network once, as networks are
   * stateful.
   */
  async run(input: string, router?: Network.Router): Promise<Network> {
    const agents = await this.availableAgents();

    if (agents.length === 0) {
      throw new Error("no agents enabled in network");
    }

    // If there's no default agent used to run the request, use our internal
    // routing agent which attempts to figure out the best agent to choose based
    // off of the network.
    const agent = await this.getNextAgent(router);
    if (!agent) {
      // TODO: If call count is 0, error.
      return this;
    }

    // Schedule the agent to run on our stack, then start popping off the stack.
    this.schedule(agent.name);

    while (
      this._stack.length > 0 &&
      (this.maxIter === 0 || this._counter < this.maxIter)
    ) {
      // XXX: It would be possible to parallel call these agents here by
      // fetching the entire stack, parallel running, then awaiting the
      // responses.   However, this confuses history and we'll take our time to
      // introduce parallelisation after the foundations are set.

      // Fetch the agent we need to call next off of the stack.
      const agentName = this._stack.shift();
      // Grab agents from the private map, as this may have been introduced in
      // the router.
      const agent = agentName && this._agents.get(agentName);
      if (!agent) {
        // We're done.
        return this;
      }

      // We force Agent to emit structured output in case of the use of tools by
      // setting maxIter to 0.
      const call = await agent.run(input, { network: this, maxIter: 0 });
      this._counter += 1;

      // Ensure that we store the call network history.
      this.state.append(call);

      // Here we face a problem: what's the definition of done?   An agent may
      // have just been called with part of the information to solve an input.
      // We may need to delegate to another agent.
      //
      // In this case, we defer to the router provided to give us next steps.
      // By default, this is an agentic router which takes the current state,
      // agents, then figures out next steps.  This can, and often should, be
      // custom code.
      const next = await this.getNextAgent(router);
      if (next) {
        this.schedule(next.name);
      }
    }

    return this;
  }

  private async getNextAgent(
    router?: Network.Router,
  ): Promise<Agent | undefined> {
    const defaultModel = this.defaultModel;
    if (!router) {
      if (!defaultModel) {
        throw new Error(
          "No router or model defined in network.  You must pass a router or a default model to use the built-in agentic router.",
        );
      }

      return defaultRoutingAgent.withModel(defaultModel);
    } else if (router instanceof Agent) {
      return router;
    }

    const stack: Agent[] = this._stack.map((name) => {
      const agent = this._agents.get(name);
      if (!agent) {
        throw new Error(`unknown agent in the network stack: ${name}`);
      }
      return agent;
    });

    const agent = await router({
      network: this,
      stack,
      lastResult: this.state.results.pop(),
      callCount: this._counter,
    });

    if (!agent) {
      return;
    }

    // Ensure this agent is part of the network.  If not, we're going to
    // automatically add it.
    if (!this._agents.has(agent.name)) {
      // XXX: Add a warning here.
      this._agents.set(agent.name, agent);
    }

    return agent;
  }
}

/**
 * RoutingAgent is an AI agent that selects the appropriate agent from the
 * network to handle the incoming request.
 */
export const defaultRoutingAgent = new Agent({
  name: "Default routing agent",
  description:
    "Selects which agents to work on based off of the current prompt and input.",

  lifecycle: {
    onFinish: ({ result }) => {
      // We never want to store this call's instructions in history.
      result.withFormatter(() => []);

      return result;
    },
  },

  tools: [
    // This tool does nothing but ensure that the model responds with the
    // agent name as valid JSON.
    createTool({
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

        // Schedule another agent.
        network.schedule(agent.name);

        return agent.name;
      },
    }),
  ],

  system: async (network?: Network): Promise<string> => {
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
  Think about the current history and status.  Determine which agent to use to handle the user's request.  Respond with the agent's name within a <response> tag as content, and select the appropriate tool.

  Your aim is to thoroughly complete the request, thinking step by step, choosing the right agent based off of the context.

  If the request has been solved, respond with one single tag, with the answer inside: <answer>$answer</answer>
</instructions>
    `;
  },
});

export namespace Network {
  export type Constructor = {
    agents: Agent[];
    defaultModel?: AiAdapter.Any;
    maxIter?: number;
    // state is any pre-existing network state to use in this Network instance.  By
    // default, new state is created without any history for every Network.
    state?: State;
  };

  /**
   * Router defines how a network coordinates between many agents.  A router is
   * a single function that gets given the network, current state, future
   * agentic calls, and the last inference result from the network.
   *
   * You can choose to create semi-autonomous networks by writing standard
   * deterministic code to call agents based off of the current state.
   *
   * You can also choose to create fully autonomous agentic networks by calling
   * a "routing agent", which determines the best agent to call based off of
   * current state.
   */
  export type Router =
    | Agent
    | ((args: Router.Args) => MaybePromise<Agent | undefined>);

  export namespace Router {
    export interface Args {
      /**
       * Network is the network that this router is coordinating.  Network state
       * is accessible via `network.state`.
       */
      network: Network;

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
