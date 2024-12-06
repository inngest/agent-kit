import { type AgenticModel } from "./model";
import { type Network } from "./network";
import {
  type State,
  InferenceResult,
  type InternalNetworkMessage,
} from "./state";
import {
  type BaseLifecycleArgs,
  type BeforeLifecycleArgs,
  type ResultLifecycleArgs,
  type Tool,
} from "./types";
import { type AnyZodType, type MaybePromise } from "./util";

/**
 * createTool is a helper that properly types the input argument for a handler
 * based off of the Zod parameter types.
 */
export const createTool = <T extends AnyZodType>(t: Tool<T>): Tool<T> => t;

/**
 * Agent represents a single agent, responsible for a set of tasks.
 */
export const createAgent = (opts: Agent.Constructor) => new Agent(opts);

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
   * system is the system prompt for the agent.
   */
  system: string | ((network?: Network) => MaybePromise<string>);

  /**
   * Assistant is the assistent message used for completion, if any.
   */
  assistant: string;

  /**
   * tools are a list of tools that this specific agent has access to.
   */
  tools: Map<string, Tool.Any>;

  /**
   * lifecycles are programmatic hooks used to manage the agent.
   */
  lifecycles: Agent.Lifecycle | undefined;

  /**
   * model is the step caller to use for this agent.  This allows the agent
   * to use a specific model which may be different to other agents in the
   * system
   */
  model: AgenticModel.Any | undefined;

  constructor(opts: Agent.Constructor) {
    this.name = opts.name;
    this.description = opts.description || "";
    this.system = opts.system;
    this.assistant = opts.assistant || "";
    this.tools = new Map();
    this.lifecycles = opts.lifecycle;
    this.model = opts.model;

    for (const tool of opts.tools || []) {
      this.tools.set(tool.name, tool);
    }
  }

  withModel(model: AgenticModel.Any): Agent {
    this.model = model;
    return this; // for chaining
  }

  /**
   * Run runs an agent with the given user input, treated as a user message.  If
   * the input is an empty string, only the system prompt will execute.
   */
  async run(
    input: string,
    {
      model,
      network,
      state: inputState,
      maxIter = 0,
    }: Agent.RunOptions | undefined = {},
  ): Promise<InferenceResult> {
    const p = model || this.model || network?.defaultModel;
    if (!p) {
      throw new Error("No step caller provided to agent");
    }

    // input state always overrides the network state.
    const state = inputState || network?.state;

    let history = state ? state.format() : [];
    let prompt = await this.agentPrompt(input, network);
    let result = new InferenceResult(this, input, prompt, history, [], [], "");
    let hasMoreActions = true;
    let iter = 0;

    do {
      // Call lifecycles each time we perform inference.
      if (this.lifecycles?.onStart) {
        const modified = await this.lifecycles.onStart({
          agent: this,
          network,
          input,
          prompt,
          history,
        });

        if (modified.stop) {
          // We allow users to prevent calling the LLM directly here.
          return result;
        }

        prompt = modified.prompt;
        history = modified.history;
      }

      const inference = await this.performInference(
        input,
        p,
        prompt,
        history,
        network,
      );

      hasMoreActions =
        this.tools.size > 0 &&
        inference.output[inference.output.length - 1]!.stop_reason !== "stop";

      result = inference;
      history = [...inference.output];
      iter++;
    } while (hasMoreActions && iter < maxIter);

    if (this.lifecycles?.onFinish) {
      result = await this.lifecycles.onFinish({ agent: this, network, result });
    }

    return result;
  }

  private async performInference(
    input: string,
    p: AgenticModel.Any,
    prompt: InternalNetworkMessage[],
    history: InternalNetworkMessage[],
    network?: Network,
  ): Promise<InferenceResult> {
    const { output, raw } = await p.infer(
      this.name,
      prompt.concat(history),
      Array.from(this.tools.values()),
    );

    // Now that we've made the call, we instantiate a new InferenceResult for
    // lifecycles and history.
    let result = new InferenceResult(
      this,
      input,
      prompt,
      history,
      output,
      [],
      typeof raw === "string" ? raw : JSON.stringify(raw),
    );
    if (this.lifecycles?.onResponse) {
      result = await this.lifecycles.onResponse({
        agent: this,
        network,
        result,
      });
    }

    // And ensure we invoke any call from the agent
    const toolCallOutput = await this.invokeTools(result.output, p, network);
    if (toolCallOutput.length > 0) {
      result.toolCalls = result.toolCalls.concat(toolCallOutput);
    }

    return result;
  }

  private async invokeTools(
    msgs: InternalNetworkMessage[],
    p: AgenticModel.Any,
    network?: Network,
  ): Promise<InternalNetworkMessage[]> {
    const output: InternalNetworkMessage[] = [];

    for (const msg of msgs) {
      if (!Array.isArray(msg.tools)) {
        continue;
      }

      for (const tool of msg.tools) {
        const found = this.tools.get(tool.name);
        if (!found) {
          throw new Error(
            `Inference requested a non-existent tool: ${tool.name}`,
          );
        }

        // Call this tool.
        //
        // XXX: You might expect this to be wrapped in a step, but each tool can
        // com
        // `network.schedule` breaks, as `step.run` memoizes so agents aren't scheduled on their
        // next loop.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await found.handler(tool.input, {
          agent: this,
          network,
          step: p.step,
        });

        // TODO: handle error and send them back to the LLM

        output.push({
          role: "tool_result",
          tools: [
            {
              type: "tool",
              id: tool.id,
              name: tool.name,
              input: tool.input.arguments as Record<string, unknown>,
            },
          ],
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          content: result ? result : `${tool.name} successfully executed`,
        });
      }
    }

    return output;
  }

  private async agentPrompt(
    input: string,
    network?: Network,
  ): Promise<InternalNetworkMessage[]> {
    // Prompt returns the full prompt for the current agent.  This does NOT
    // include the existing network's state as part of the prompt.
    //
    // Note that the agent's system message always comes first.
    const messages: InternalNetworkMessage[] = [
      {
        role: "system",
        content:
          typeof this.system === "string"
            ? this.system
            : await this.system(network),
      },
    ];

    if (input.length > 0) {
      messages.push({ role: "user", content: input });
    }

    if (this.assistant.length > 0) {
      messages.push({ role: "assistant", content: this.assistant });
    }

    return messages;
  }
}

export namespace Agent {
  export interface Constructor {
    name: string;
    description?: string;
    system: string | ((network?: Network) => MaybePromise<string>);
    assistant?: string;
    tools?: Tool.Any[];
    lifecycle?: Lifecycle;
    model?: AgenticModel.Any;
  }

  export interface RunOptions {
    model?: AgenticModel.Any;
    network?: Network;
    /**
     * State allows you to pass custom state into a single agent run call.  This should only
     * be provided if you are running agents outside of a network.  Networks automatically
     * supply their own state.
     */
    state?: State;
    maxIter?: number;
  }

  export interface Lifecycle {
    /**
     * enabled selectively enables or disables this agent based off of network
     * state.  If this function is not provided, the agent is always enabled.
     */
    enabled?: (args: BaseLifecycleArgs) => MaybePromise<boolean>;

    /**
     * onStart allows you to intercept and modify the input prompt for a given
     * agent, or prevent the agent from being called altogether by throwing an
     * error.
     *
     * This receives the full agent prompt.  If this is a networked agent, the
     * agent will also receive the network's history which will be concatenated
     * to the end of the prompt when making the inference request.
     *
     */
    onStart?: (args: BeforeLifecycleArgs) => MaybePromise<{
      prompt: InternalNetworkMessage[];
      history: InternalNetworkMessage[];
      // stop, if true, will prevent calling the agent
      stop: boolean;
    }>;

    /**
     * onResponse is called after the inference call finishes, before any tools
     * have been invoked. This allows you to moderate the response prior to
     * running tools.
     */
    onResponse?: (args: ResultLifecycleArgs) => MaybePromise<InferenceResult>;

    /**
     * onFinish is called with a finalized InferenceResult, including any tool
     * call results. The returned InferenceResult will be saved to network
     * history, if the agent is part of the network.
     *
     */
    onFinish?: (args: ResultLifecycleArgs) => MaybePromise<InferenceResult>;
  }
}
