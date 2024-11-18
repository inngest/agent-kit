import { Tool, CallLifecycle, CallLifecycleArgs } from "./types";
import { Network } from "./network";
import { InferenceResponse, Provider } from "./provider";

export interface AgentConstructor {
  name: string;
  instructions: string | ((network?: Network) => string);
  tools?: Tool[];
  lifecycle?: AgentLifecycle;
}

/**
 * Agent represents a single agent, responsible for a set of tasks.
 */
export class Agent {
  /**
   * name is the name of the agent.
   */
  name: string;

  /**
   * instructions is the system prompt for the agent.
   */
  instructions: string | ((network?: Network) => string);

  /**
   * tools are a list of tools that this specific agent has access to.
   */
  tools: Tool[] | undefined;

  /**
   * lifecycles are programmatic hooks used to manage the agent.
   */
  lifecycles: AgentLifecycle | undefined;

  /**
   * provider is the step caller to use for this agent.  This allows the agent
   * to use a specific model which may be different to other agents in the system
   */
  provider: Provider | undefined;

  constructor(opts: AgentConstructor) {
    this.name = opts.name;
    this.instructions = opts.instructions;
    this.tools = opts.tools;
    this.lifecycles = opts.lifecycle;
  }

  withProvider(provider: Provider): Agent {
    this.provider = provider;
    return this; // for chaining
  }

  /**
   * Run runs an agent with the given user input, treated as a user message.  If the
   * input is an empty string, only the system prompt will execute.
   */
  async run(input: string, { provider, network }: AgentRunOptions): Promise<InferenceResponse> {
    const p = provider || this.provider;
    if (!p) {
      throw new Error("No step caller provided to agent");
    }

    if (this.lifecycles) {
      this.lifecycles.before({ agent: this, network: network });
    }

    // Add previous message from the network's history, if defined.
    const messages = network ? network.state.history : [];
    // Then, add our system prompt and optional user prompt.
    messages.push({ role: "system", content: this.prompt(network) });
    if (input.length > 0) {
      messages.push({ role: "user", content: input });
    }

    const [output, raw] = await p.infer(this.name, messages, this.tools);

    if (this.lifecycles) {
      this.lifecycles.after({ agent: this, network: network, result: raw });
    }

    return [output, raw];
  }

  // prompt returns the prompt for running the agent.
  private prompt(network?: Network) {
    if (typeof this.instructions === "string") {
      return this.instructions;
    }
    return this.instructions(network);
  }
}

export interface AgentRunOptions {
  provider?: Provider;
  network?: Network;
}

export interface AgentLifecycle extends CallLifecycle {
  enabled: (args: CallLifecycleArgs) => Promise<boolean>
}
