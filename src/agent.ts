import { type AiAdapter } from "inngest";
import { createAgenticModelFromAiAdapter, type AgenticModel } from "./model";
import { type Network } from "./network";
import {
  type State,
  InferenceResult,
  type Message,
  type ToolResultMessage,
} from "./state";
import { type Tool } from "./types";
import { type AnyZodType, type MaybePromise, getStepTools } from "./util";

/**
 * createTool is a helper that properly types the input argument for a handler
 * based off of the Zod parameter types.
 */
export const createTool = <T extends AnyZodType>(t: Tool<T>): Tool<T> => t;

/**
 * Agent represents a single agent, responsible for a set of tasks.
 */
export const createAgent = (opts: Agent.Constructor) => new Agent(opts);

export const createRoutingAgent = (opts: Agent.RoutingConstructor) =>
  new RoutingAgent(opts);

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
   * tool_choice allows you to specify whether tools are automatically.  this defaults
   * to "auto", allowing the model to detect when to call tools automatically.  Choices are:
   *
   * - "auto": allow the model to choose tools automatically
   * - "any": force the use of any tool in the tools map
   * - string: force the name of a particular tool
   */
  tool_choice?: Tool.Choice;

  /**
   * lifecycles are programmatic hooks used to manage the agent.
   */
  lifecycles: Agent.Lifecycle | Agent.RoutingLifecycle | undefined;

  /**
   * model is the step caller to use for this agent.  This allows the agent
   * to use a specific model which may be different to other agents in the
   * system
   */
  model: AiAdapter.Any | undefined;

  constructor(opts: Agent.Constructor | Agent.RoutingConstructor) {
    this.name = opts.name;
    this.description = opts.description || "";
    this.system = opts.system;
    this.assistant = opts.assistant || "";
    this.tools = new Map();
    this.tool_choice = opts.tool_choice;
    this.lifecycles = opts.lifecycle;
    this.model = opts.model;

    for (const tool of opts.tools || []) {
      this.tools.set(tool.name, tool);
    }
  }

  withModel(model: AiAdapter.Any): Agent {
    return new Agent({
      name: this.name,
      description: this.description,
      system: this.system,
      assistant: this.assistant,
      tools: Array.from(this.tools.values()),
      lifecycle: this.lifecycles,
      model,
    });
  }

  /**
   * Run runs an agent with the given user input, treated as a user message.  If
   * the input is an empty string, only the system prompt will execute.
   */
  async run(
    input: string,
    { model, network, state, maxIter = 0 }: Agent.RunOptions | undefined = {},
  ): Promise<InferenceResult> {
    const rawModel = model || this.model || network?.defaultModel;
    if (!rawModel) {
      throw new Error("No step caller provided to agent");
    }

    const p = createAgenticModelFromAiAdapter(rawModel);

    // input state always overrides the network state.
    const s = state || network?.state;

    let history = s ? s.format() : [];
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

    // Note that the routing lifecycles aren't called by the agent.  They're called
    // by the network.

    return result;
  }

  private async performInference(
    input: string,
    p: AgenticModel.Any,
    prompt: Message[],
    history: Message[],
    network?: Network,
  ): Promise<InferenceResult> {
    const { output, raw } = await p.infer(
      this.name,
      prompt.concat(history),
      Array.from(this.tools.values()),
      this.tool_choice || "auto",
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
    msgs: Message[],
    p: AgenticModel.Any,
    network?: Network,
  ): Promise<ToolResultMessage[]> {
    const output: ToolResultMessage[] = [];

    for (const msg of msgs) {
      if (msg.type !== "tool_call") {
        continue;
      }

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
        // use multiple step tools, eg. `step.run`, then `step.waitForEvent` for
        // human in the loop tasks.
        //
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await found.handler(tool.input, {
          agent: this,
          network,
          step: await getStepTools(),
        });

        // TODO: handle error and send them back to the LLM

        output.push({
          role: "tool_result",
          type: "tool_result",
          tool: {
            type: "tool",
            id: tool.id,
            name: tool.name,
            input: tool.input.arguments as Record<string, unknown>,
          },

          content: result ? result : `${tool.name} successfully executed`,
          stop_reason: "tool",
        });
      }
    }

    return output;
  }

  private async agentPrompt(
    input: string,
    network?: Network,
  ): Promise<Message[]> {
    // Prompt returns the full prompt for the current agent.  This does NOT
    // include the existing network's state as part of the prompt.
    //
    // Note that the agent's system message always comes first.
    const messages: Message[] = [
      {
        type: "text",
        role: "system",
        content:
          typeof this.system === "string"
            ? this.system
            : await this.system(network),
      },
    ];

    if (input.length > 0) {
      messages.push({ type: "text", role: "user", content: input });
    }

    if (this.assistant.length > 0) {
      messages.push({
        type: "text",
        role: "assistant",
        content: this.assistant,
      });
    }

    return messages;
  }
}

export class RoutingAgent extends Agent {
  type = "routing";
  override lifecycles: Agent.RoutingLifecycle;
  constructor(opts: Agent.RoutingConstructor) {
    super(opts);
    this.lifecycles = opts.lifecycle;
  }

  override withModel(model: AiAdapter.Any): RoutingAgent {
    return new RoutingAgent({
      name: this.name,
      description: this.description,
      system: this.system,
      assistant: this.assistant,
      tools: Array.from(this.tools.values()),
      lifecycle: this.lifecycles,
      model,
    });
  }
}

export namespace Agent {
  export interface Constructor {
    name: string;
    description?: string;
    system: string | ((network?: Network) => MaybePromise<string>);
    assistant?: string;
    tools?: Tool.Any[];
    tool_choice?: Tool.Choice;
    lifecycle?: Lifecycle;
    model?: AiAdapter.Any;
  }

  export interface RoutingConstructor extends Omit<Constructor, "lifecycle"> {
    lifecycle: RoutingLifecycle;
  }

  export interface RoutingConstructor extends Omit<Constructor, "lifecycle"> {
    lifecycle: RoutingLifecycle;
  }

  export interface RoutingConstructor extends Omit<Constructor, "lifecycle"> {
    lifecycle: RoutingLifecycle;
  }

  export interface RunOptions {
    model?: AiAdapter.Any;
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
    enabled?: (args: Agent.LifecycleArgs.Base) => MaybePromise<boolean>;

    /**
     * onStart is called just before an agent starts an inference call.
     *
     * This receives the full agent prompt.  If this is a networked agent, the
     * agent will also receive the network's history which will be concatenated
     * to the end of the prompt when making the inference request.
     *
     * The return values can be used to adjust the prompt, history, or to stop
     * the agent from making the call altogether.
     *
     */
    onStart?: (args: Agent.LifecycleArgs.Before) => MaybePromise<{
      prompt: Message[];
      history: Message[];
      // stop, if true, will prevent calling the agent
      stop: boolean;
    }>;

    /**
     * onResponse is called after the inference call finishes, before any tools
     * have been invoked. This allows you to moderate the response prior to
     * running tools.
     */
    onResponse?: (
      args: Agent.LifecycleArgs.Result,
    ) => MaybePromise<InferenceResult>;

    /**
     * onFinish is called with a finalized InferenceResult, including any tool
     * call results. The returned InferenceResult will be saved to network
     * history, if the agent is part of the network.
     *
     */
    onFinish?: (
      args: Agent.LifecycleArgs.Result,
    ) => MaybePromise<InferenceResult>;
  }

  export namespace LifecycleArgs {
    export interface Base {
      // Agent is the agent that made the call.
      agent: Agent;
      // Network represents the network that this agent or lifecycle belongs to.
      network?: Network;
    }

    export interface Result extends Base {
      result: InferenceResult;
    }

    export interface Before extends Base {
      // input is the user request for the entire agentic operation.
      input?: string;

      // prompt is the system, user, and any assistant prompt as generated
      // by the Agent.  This does not include any past history.
      prompt: Message[];

      // history is the past history as generated via State.  Ths will be added
      // after the prompt to form a single conversation log.
      history?: Message[];
    }
  }

  export interface RoutingLifecycle extends Lifecycle {
    onRoute: RouterFn;
  }

  export type RouterFn = (args: Agent.RouterArgs) => string[] | undefined;

  /**
   * Router args are the arguments passed to the onRoute lifecycle hook.
   */
  export type RouterArgs = Agent.LifecycleArgs.Result;
}
