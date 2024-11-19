import { Tool, InferenceLifecycle, BaseLifecycleArgs } from "./types";
import { Network } from "./network";
import { Provider } from "./provider";
import { Message, AgenticCall } from "./state";

export interface AgentConstructor {
  name: string;
  description?: string;
  instructions: string | ((network?: Network) => string);
  assistant?: string;
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
   * description is the description of the agent.
   */
  description: string;

  /**
   * instructions is the system prompt for the agent.
   */
  instructions: string | ((network?: Network) => string);

  
  /**
   * Assistant is the assistent message used for completion, if any.
   */
  assistant: string;

  /**
   * tools are a list of tools that this specific agent has access to.
   */
  tools: Map<string, Tool>;

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
    this.description = opts.description || "";
    this.instructions = opts.instructions;
    this.assistant = opts.assistant || "";
    this.tools = new Map();
    this.lifecycles = opts.lifecycle;

    for (const tool of opts.tools || []) {
      this.tools.set(tool.name, tool);
    }
  }

  withProvider(provider: Provider): Agent {
    this.provider = provider;
    return this; // for chaining
  }

  /**
   * Run runs an agent with the given user input, treated as a user message.  If the
   * input is an empty string, only the system prompt will execute.
   */
  async run(input: string, { provider, network }: AgentRunOptions): Promise<AgenticCall> {

    const p = provider || this.provider || network?.defaultProvider;
    if (!p) {
      throw new Error("No step caller provided to agent");
    }

    let instructions = this.agentPrompt(input, network);

    // TODO: History
    let history = network ? network.state.history : [];

    if (this.lifecycles?.before) {
      const modified = await this.lifecycles.before({ agent: this, network, input, instructions, history });
      instructions = modified.instructions;
      history = modified.history;
    }

    let { output, raw } = await p.infer(
      this.name,
      instructions.concat(history),
      Array.from(this.tools.values()),
    );

    // Now that we've made the call, we instantiate a new AgenticCall for lifecycles and history.
    let call = new AgenticCall(this, input, instructions, instructions.concat(history), output, [], raw);
    if (this.lifecycles?.afterInfer) {
      call = await this.lifecycles.afterInfer({ agent: this, network, call });
    }

    // And ensure we invoke any call from the agent
    call.toolCalls = await this.invokeTools(call.output, network);
    if (this.lifecycles?.afterTools) {
      call = await this.lifecycles.afterTools({ agent: this, network, call });
    }

    return call;
  }

  private async invokeTools(msgs: Message[], network?: Network): Promise<Message[]> {
    const output: Message[] = [];

    for (const msg of msgs) {
      if (!Array.isArray(msg.tools)) {
        continue
      }

      for (const tool of msg.tools) {
        const found = this.tools.get(tool.name);
        if (!found) {
          throw new Error(`Inference requested a non-existent tool: ${tool.name}`)
        }

        // Call this tool.
        const result = await found.handler(tool.input, this, network);
        if (result === undefined) {
          // This had no result, so we don't wnat to save it to the state.
          continue
        }

        output.push({
          role: "tool_result",
          content: {
            type: "tool_result",
            id: tool.id,
            content: result, // TODO: Properly type content.
          },
        });
      }
    }

    return output;
  }

  private agentPrompt(input: string, network?: Network): Message[] {
    // Prompt returns the full prompt for the current agent.  This does NOT include
    // the existing network's state as part of the prompt.
    // 
    // Note that the agent's system message always comes first.
    const messages: Message[] = [{
      role: "system",
      content: typeof this.instructions === "string" ? this.instructions : this.instructions(network),
    }];

    if (input.length > 0) {
      messages.push({ role: "user", content: input });
    }

    if (this.assistant.length > 0) {
      messages.push({ role: "assistant", content: this.assistant });
    }

    return messages;
  }

}

export interface AgentRunOptions {
  provider?: Provider;
  network?: Network;
}

export interface AgentLifecycle extends InferenceLifecycle {
  enabled?: (args: BaseLifecycleArgs) => Promise<boolean>
}
