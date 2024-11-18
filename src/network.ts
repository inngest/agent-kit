import { CallLifecycle } from "./types";
import { Agent } from "./agent";
import { Provider } from "./provider";
import { State } from "./state";

/**
 * Network represents a network of agents.
 */
export class Network {
  agents: Map<string, Agent>;

  /**
   * state is the entire agent's state.
   */
  state: State;

  /**
   * defaultProvider is the default Provider to use with the network.  This will not override
   * an agent's specific Provider if the agent already has a Provider defined
   * (eg. via withProvider or via its constructor).
   */
  defaultProvider: Provider;

  /**
   * lifecycles are programmatic hooks used to manage the network of agents.  Network hooks
   * include:
   *   - Before agent calls
   *   - After agent calls
   */
  lifecycles: CallLifecycle;

  constructor({ agents, provider }: { agents: Agent[], provider: Provider }) {
    this.agents = new Map();
    this.state = new State();
    this.defaultProvider = provider

    for (let agent of agents) {
      this.agents.set(agent.name, agent);
    }
  }

  get availableAgents(): Array<Agent> {
    // Which agents are enabled?
    return Array.from(this.agents.values()).filter(function(a) {
      return !a.lifecycles || a.lifecycles.enabled({ agent: a, network: this });
    })
  }

  /**
   * addAgent adds a new agent to the network.
   */
  addAgent(agent: Agent) {
    this.agents.set(agent.name, agent);
  }

  /**
   * run handles a given request using the network of agents.
   */
  async run(input: string, defaultAgent?: Agent): Promise<any> {
    const agents = this.availableAgents;

    if (agents.length === 0) {
      throw new Error("no agents enabled in network"); 
    }

    // If there's no default agent used to run the request, use our internal routing agent
    // which attempts to figure out the best agent to choose based off of the network.
    const agent = defaultAgent || defaultRoutingAgent.withProvider(this.defaultProvider);

    const [output, _raw] = await agent.run(input, { network: this });

    // Add the output to messages.
    for (const m of output) {
      this.state.history.push(m);
    }

    // TODO: Determine what course of action to do next.

    return output;
  }
}

/**
 * RoutingAgent is an AI agent that selects the appropriate agent from the network to
 * handle the incoming request.
 */
export const defaultRoutingAgent = new Agent({
  name: "Default routing agent",

  instructions: (network?: Network): string => {
    if (!network) {
      throw new Error("The routing agent can only be used within a network of agents");
    }

    return `You are the orchestrator between a group of agents.  Each agent is suited for a set of specific tasks, and has a name, instructions, and a set of tools.

The following agents are available:
<agents>
  ${network.availableAgents.map(a => {
    return `
    <agent>
      <name>${a.name}</name>
      <tools>${a.tools}</tools>
    </agent>`;
  })}
</agents>

Follow the set of instructions:

<instructions>
        Determine which agent to use to handle the user's request.  Respond with the agent's name within a <response> tag.
</instructions>
    `
  }
});

