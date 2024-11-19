import { InferenceLifecycle } from "./types";
import { Agent } from "./agent";
import { Provider } from "./provider";
import { NetworkState, Message, AgenticCall } from "./state";

type Router = Agent | (({ network, callCount }: { network: Network, callCount: number }) => Promise<Agent | undefined>);

/**
 * Network represents a network of agents.
 */
export class Network {
  agents: Map<string, Agent>;

  /**
   * state is the entire agent's state.
   */
  state: NetworkState;

  /**
   * defaultProvider is the default Provider to use with the network.  This will not override
   * an agent's specific Provider if the agent already has a Provider defined
   * (eg. via withProvider or via its constructor).
   */
  defaultProvider: Provider;

  private _stack: Array<() => Promise<AgenticCall>>

  private _counter = 0;

  constructor({ agents, defaultProvider }: { agents: Agent[], defaultProvider: Provider }) {
    this.agents = new Map();
    this.state = new NetworkState();
    this.defaultProvider = defaultProvider
    this._stack = [];

    for (let agent of agents) {
      this.agents.set(agent.name, agent);
    }
  }

  async availableAgents(): Promise<Agent[]> {
    const available: Agent[] = [];
    const all = Array.from(this.agents.values());
    for (const a of all) {
      const enabled = a?.lifecycles?.enabled;
      if (!enabled || await enabled({ agent: a, network: this })) {
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
  async schedule(f: () => Promise<AgenticCall>) {
    this._stack.push(f);
  }

  /**
   * run handles a given request using the network of agents.  It is not concurrency-safe;
   * you can only call run on a network once, as networks are stateful.
   */
  async run(input: string, router?: Router): Promise<any> {
    const agents = await this.availableAgents();

    if (agents.length === 0) {
      throw new Error("no agents enabled in network"); 
    }

    // If there's no default agent used to run the request, use our internal routing agent
    // which attempts to figure out the best agent to choose based off of the network.
    const agent = await this.getNextAgent(router);
    if (!agent) {
      // TODO: What data do we return?  What's the type here?
      return;
    }

    // Schedule the agent to run on our stack, then start popping off the stack.
    this.schedule(async () => await agent.run(input, { network: this }));
    while (this._stack.length > 0) {
      const infer = this._stack.shift();

      if (!infer) {
        // We're done.
        return;
      }

      const call = await infer();
      this._counter += 1;

      // Ensure that we store the call network history.
      this.state.append(call);

      // TODO: Agents may schedule things onto the stack here, and we may have to also.
      // Figure out what to do as a network of agents in the parent.
      if (this._stack.length === 0) {

        if (this._counter < 5) {
          // TODO: Re-invoke the agent until we have a solution.
          this.schedule(async () => await agent.run(input, { network: this }));
          continue
        }

        return this;
      }
    }
  }

  private async getNextAgent(router?: Router): Promise<Agent | undefined> {
    if (!router) {
      return defaultRoutingAgent.withProvider(this.defaultProvider);
    }
    if (router instanceof Agent) {
      return router;
    }
    return await router({ network: this, callCount: this._counter });
  }
}

/**
 * RoutingAgent is an AI agent that selects the appropriate agent from the network to
 * handle the incoming request.
 */
export const defaultRoutingAgent = new Agent({
  name: "Default routing agent",

  lifecycle: {
    afterTools: async ({ network, call }): Promise<AgenticCall> => {
      // We never want to store this call's instructions in history.
      call.instructions = [];
      call.toolCalls = [];

      if ((network?.state?.history || []).length > 0) {
        // This agent does not store anything in history if there's already items there.
        call.output = [];
        return call;
      }

      const agents = await network?.availableAgents();

      // Store an initial prompt.
      call.output = [
        {
          role: "assistant",
          content: `You are one of a network of agents working together to solve the given request:
<request>${call.input}</request>.


The following agents are currently available:

<agents>
  ${agents?.map(a => {
    return `
    <agent>
      <name>${a.name}</name>
      <description>${a.description}</description>
    </agent>`;
  }).join("\n")}
</agents>

Each agent will begin their response with their name in an <agent /> tag.  Think about your role
carefully.

Your aim is to thoroughly complete the request, thinking step by step.  Select one agent at a time based off
of the current conversation.

If the request has been solved, respond with one single tag, with the solution inside: <solution>$solution</solution>.
`
        }
      ]

      return call;
    },
  },

  tools: [
    // This tool does nothing but ensure that the model responds with the
    // agent name as valid JSON.
    {
      name: "select_agent",
      description: "select an agent to handle the input, based off of the current conversation",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the agent that should handle the request", 
          },
        },
        required: ["name"],
        additionalProperties: false
      },
      handler: async ({ name }, _agent, network) => {
        if (!network) {
          throw new Error("The routing agent can only be used within a network of agents");
        }

        const agent = network.agents.get(name);
        if (agent === undefined) {
          throw new Error(`The routing agent requested an agent that doesn't exist: ${name}`);
        }

        // Schedule another agent.
        network.schedule(async () => {
          return agent.run("", { network });
        });

        return agent.name;
      },
    }
  ],

  instructions: async (network?: Network): Promise<string> => {
    if (!network) {
      throw new Error("The routing agent can only be used within a network of agents");
    }

    const agents = await network?.availableAgents();

    return `You are the orchestrator between a group of agents.  Each agent is suited for a set of specific tasks, and has a name, instructions, and a set of tools.

The following agents are available:
<agents>
  ${agents.map(a => {
    return `
    <agent>
      <name>${a.name}</name>
      <description>${a.description}</description>
      <tools>${JSON.stringify(Array.from(a.tools.values()))}</tools>
    </agent>`;
  })}
</agents>

Follow the set of instructions:

<instructions>
  Think about the current history and status.  Determine which agent to use to handle the user's request.  Respond with the agent's name within a <response> tag as content, and select the appropriate tool.

  Your aim is to thoroughly complete the request, thinking step by step, choosing the right agent based off of the context.

  If the request has been solved, respond with one single tag, with the solution inside: <solution>$solution</solution>
</instructions>
    `
  },
});
