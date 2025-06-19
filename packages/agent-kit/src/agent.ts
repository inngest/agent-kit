import {
  JSONSchemaToZod,
  type JSONSchema,
} from "@dmitryrechkin/json-schema-to-zod";
import { type AiAdapter } from "@inngest/ai";
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { type Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { EventSource } from "eventsource";
import { referenceFunction, type Inngest } from "inngest";
import { type InngestFunction } from "inngest/components/InngestFunction";
import { serializeError } from "inngest/helpers/errors";
import { type MinimalEventPayload } from "inngest/types";
import type { ZodType } from "zod";
import { createAgenticModelFromAiAdapter, type AgenticModel } from "./model";
import { createNetwork, NetworkRun } from "./network";
import { State, type StateData } from "./state";
import { type MCP, type Tool } from "./tool";
import { AgentResult, type Message, type ToolResultMessage } from "./types";
import {
  getInngestFnInput,
  getStepTools,
  isInngestFn,
  type MaybePromise,
} from "./util";

/**
 * Agent represents a single agent, responsible for a set of tasks.
 */
export const createAgent = <T extends StateData>(opts: Agent.Constructor<T>) =>
  new Agent(opts);

export const createRoutingAgent = <T extends StateData>(
  opts: Agent.RoutingConstructor<T>
) => new RoutingAgent(opts);

/**
 * Agent represents a single agent, responsible for a set of tasks.
 */
export class Agent<T extends StateData> {
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
  system: string | ((ctx: { network?: NetworkRun<T> }) => MaybePromise<string>);

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
  lifecycles: Agent.Lifecycle<T> | Agent.RoutingLifecycle<T> | undefined;

  /**
   * model is the step caller to use for this agent.  This allows the agent
   * to use a specific model which may be different to other agents in the
   * system
   */
  model: AiAdapter.Any | undefined;

  /**
   * mcpServers is a list of MCP (model-context-protocol) servers which can
   * provide tools to the agent.
   */
  mcpServers?: MCP.Server[];

  // _mcpInit records whether the MCP tool list has been initialized.
  private _mcpClients: MCPClient[];

  constructor(opts: Agent.Constructor<T> | Agent.RoutingConstructor<T>) {
    this.name = opts.name;
    this.description = opts.description || "";
    this.system = opts.system;
    this.assistant = opts.assistant || "";
    this.tools = new Map();
    this.tool_choice = opts.tool_choice;
    this.lifecycles = opts.lifecycle;
    this.model = opts.model;
    this.setTools(opts.tools);
    this.mcpServers = opts.mcpServers;
    this._mcpClients = [];
  }

  private setTools(tools: Agent.Constructor<T>["tools"]): void {
    for (const tool of tools || []) {
      if (isInngestFn(tool)) {
        this.tools.set(tool["absoluteId"], {
          name: tool["absoluteId"],
          description: tool.description,
          // TODO Should we error here if we can't find an input schema?
          parameters: getInngestFnInput(tool),
          handler: async (input: MinimalEventPayload["data"], opts) => {
            // Doing this late means a potential throw if we use the agent in a
            // non-Inngest environment. We could instead calculate the tool list
            // JIT and omit any Inngest tools if we're not in an Inngest
            // context.
            const step = await getStepTools();
            if (!step) {
              throw new Error("Inngest tool called outside of Inngest context");
            }

            const stepId = `${opts.agent.name}/tools/${tool["absoluteId"]}`;

            return step.invoke(stepId, {
              function: referenceFunction({
                appId: (tool["client"] as Inngest.Any)["id"],
                functionId: tool.id(),
              }),
              data: input,
            });
          },
        });
      } else {
        this.tools.set(tool.name, tool);
      }
    }
  }

  withModel(model: AiAdapter.Any): Agent<T> {
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
    { model, network, state, maxIter = 0 }: Agent.RunOptions<T> | undefined = {}
  ): Promise<AgentResult> {
    // Attempt to resolve the MCP tools, if we haven't yet done so.
    await this.initMCP();

    const rawModel = model || this.model || network?.defaultModel;
    if (!rawModel) {
      throw new Error("No model provided to agent");
    }

    const p = createAgenticModelFromAiAdapter(rawModel);

    // input state always overrides the network state.
    const s = state || network?.state || new State();
    const run = new NetworkRun(
      network || createNetwork<T>({ name: "default", agents: [] }),
      s
    );

    let history = s ? s.formatHistory() : [];
    let prompt = await this.agentPrompt(input, run);
    let result = new AgentResult(
      this.name,
      [],
      [],
      new Date(),
      prompt,
      history,
      ""
    );
    let hasMoreActions = true;
    let iter = 0;

    do {
      // Call lifecycles each time we perform inference.
      if (this.lifecycles?.onStart) {
        const modified = await this.lifecycles.onStart({
          agent: this,
          network: run,
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

      const inference = await this.performInference(p, prompt, history, run);

      hasMoreActions = Boolean(
        this.tools.size > 0 &&
          inference.output.length &&
          inference.output[inference.output.length - 1]!.stop_reason !== "stop"
      );

      result = inference;
      history = [...inference.output];
      iter++;
    } while (hasMoreActions && iter < maxIter);

    if (this.lifecycles?.onFinish) {
      result = await this.lifecycles.onFinish({
        agent: this,
        network: run,
        result,
      });
    }

    // Note that the routing lifecycles aren't called by the agent.  They're called
    // by the network.

    return result;
  }

  private async performInference(
    p: AgenticModel.Any,
    prompt: Message[],
    history: Message[],
    network: NetworkRun<T>
  ): Promise<AgentResult> {
    const { output, raw } = await p.infer(
      this.name,
      prompt.concat(history),
      Array.from(this.tools.values()),
      this.tool_choice || "auto"
    );

    // Now that we've made the call, we instantiate a new AgentResult for
    // lifecycles and history.
    let result = new AgentResult(
      this.name,
      output,
      [],
      new Date(),
      prompt,
      history,
      typeof raw === "string" ? raw : JSON.stringify(raw)
    );
    if (this.lifecycles?.onResponse) {
      result = await this.lifecycles.onResponse({
        agent: this,
        network,
        result,
      });
    }

    // And ensure we invoke any call from the agent
    const toolCallOutput = await this.invokeTools(result.output, network);
    if (toolCallOutput.length > 0) {
      result.toolCalls = result.toolCalls.concat(toolCallOutput);
    }

    return result;
  }

  /**
   * invokeTools takes output messages from an inference call then invokes any tools
   * in the message responses.
   */
  private async invokeTools(
    msgs: Message[],
    network: NetworkRun<T>
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
            `Inference requested a non-existent tool: ${tool.name}`
          );
        }

        // Call this tool.
        //
        // XXX: You might expect this to be wrapped in a step, but each tool can
        // use multiple step tools, eg. `step.run`, then `step.waitForEvent` for
        // human in the loop tasks.
        //

        const result = await Promise.resolve(
          found.handler(tool.input, {
            agent: this,
            network,
            step: await getStepTools(),
          })
        )
          .then((r) => {
            return {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              data:
                typeof r === "undefined"
                  ? `${tool.name} successfully executed`
                  : r,
            };
          })
          .catch((err) => {
            return { error: serializeError(err) };
          });

        output.push({
          role: "tool_result",
          type: "tool_result",
          tool: {
            type: "tool",
            id: tool.id,
            name: tool.name,
            input: tool.input.arguments as Record<string, unknown>,
          },

          content: result,
          stop_reason: "tool",
        });
      }
    }

    return output;
  }

  private async agentPrompt(
    input: string,
    network?: NetworkRun<T>
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
            : await this.system({ network }),
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

  // initMCP fetches all tools from the agent's MCP servers, adding them to the tool list.
  // This is all that's necessary in order to enable MCP tool use within agents
  private async initMCP() {
    if (!this.mcpServers || this._mcpClients.length >= this.mcpServers.length) {
      return;
    }

    const promises = [];
    for (const server of this.mcpServers) {
      promises.push(this.listMCPTools(server));
    }

    await Promise.all(promises);
  }

  /**
   * listMCPTools lists all available tools for a given MCP server
   */
  private async listMCPTools(server: MCP.Server) {
    const client = await this.mcpClient(server);
    this._mcpClients.push(client);
    try {
      const results = await client.request(
        { method: "tools/list" },
        ListToolsResultSchema
      );
      results.tools.forEach((t) => {
        const name = `${server.name}-${t.name}`;

        let zschema: undefined | ZodType;
        try {
          zschema = JSONSchemaToZod.convert(t.inputSchema as JSONSchema);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          // Do nothing here.
          zschema = undefined;
        }

        // Add the MCP tools directly to the tool set.
        this.tools.set(name, {
          name: name,
          description: t.description,
          parameters: zschema,
          mcp: {
            server,
            tool: t,
          },
          handler: async (input: { [x: string]: unknown } | undefined) => {
            const fn = () =>
              client.callTool({
                name: t.name,
                arguments: input,
              });

            const step = await getStepTools();
            const result = await (step?.run(name, fn) ?? fn());

            return result.content;
          },
        });
      });
    } catch (e) {
      console.warn("error listing mcp tools", e);
    }
  }

  /**
   * mcpClient creates a new MCP client for the given server.
   */
  private async mcpClient(server: MCP.Server): Promise<MCPClient> {
    // Does this client already exist?
    const transport: Transport = (() => {
      switch (server.transport.type) {
        case "streamable-http":
          return new StreamableHTTPClientTransport(
            new URL(server.transport.url),
            {
              requestInit: server.transport.requestInit,
              authProvider: server.transport.authProvider,
              reconnectionOptions: server.transport.reconnectionOptions,
              sessionId: server.transport.sessionId,
            }
          );
        case "sse":
          // Check if EventSource is defined.  If not, we use a polyfill.
          if (global.EventSource === undefined) {
            global.EventSource = EventSource;
          }
          return new SSEClientTransport(new URL(server.transport.url), {
            eventSourceInit: server.transport.eventSourceInit,
            requestInit: server.transport.requestInit,
          });
        case "ws":
          return new WebSocketClientTransport(new URL(server.transport.url));
      }
    })();

    const client = new MCPClient(
      {
        name: this.name,
        // XXX: This version should change.
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
    try {
      await client.connect(transport);
    } catch (e) {
      // The transport closed.
      console.warn("mcp server disconnected", server, e);
    }
    return client;
  }
}

export class RoutingAgent<T extends StateData> extends Agent<T> {
  type = "routing";
  override lifecycles: Agent.RoutingLifecycle<T>;
  constructor(opts: Agent.RoutingConstructor<T>) {
    super(opts);
    this.lifecycles = opts.lifecycle;
  }

  override withModel(model: AiAdapter.Any): RoutingAgent<T> {
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
  export interface Constructor<T extends StateData> {
    name: string;
    description?: string;
    system:
      | string
      | ((ctx: { network?: NetworkRun<T> }) => MaybePromise<string>);
    assistant?: string;
    tools?: (Tool.Any | InngestFunction.Any)[];
    tool_choice?: Tool.Choice;
    lifecycle?: Lifecycle<T>;
    model?: AiAdapter.Any;
    mcpServers?: MCP.Server[];
  }

  export interface RoutingConstructor<T extends StateData>
    extends Omit<Constructor<T>, "lifecycle"> {
    lifecycle: RoutingLifecycle<T>;
  }

  export interface RoutingConstructor<T extends StateData>
    extends Omit<Constructor<T>, "lifecycle"> {
    lifecycle: RoutingLifecycle<T>;
  }

  export interface RoutingConstructor<T extends StateData>
    extends Omit<Constructor<T>, "lifecycle"> {
    lifecycle: RoutingLifecycle<T>;
  }

  export interface RunOptions<T extends StateData> {
    model?: AiAdapter.Any;
    network?: NetworkRun<T>;
    /**
     * State allows you to pass custom state into a single agent run call.  This should only
     * be provided if you are running agents outside of a network.  Networks automatically
     * supply their own state.
     */
    state?: State<T>;
    maxIter?: number;
  }

  export interface Lifecycle<T extends StateData> {
    /**
     * enabled selectively enables or disables this agent based off of network
     * state.  If this function is not provided, the agent is always enabled.
     */
    enabled?: (args: Agent.LifecycleArgs.Base<T>) => MaybePromise<boolean>;

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
    onStart?: (args: Agent.LifecycleArgs.Before<T>) => MaybePromise<{
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
      args: Agent.LifecycleArgs.Result<T>
    ) => MaybePromise<AgentResult>;

    /**
     * onFinish is called with a finalized AgentResult, including any tool
     * call results. The returned AgentResult will be saved to network
     * history, if the agent is part of the network.
     *
     */
    onFinish?: (
      args: Agent.LifecycleArgs.Result<T>
    ) => MaybePromise<AgentResult>;
  }

  export namespace LifecycleArgs {
    export interface Base<T extends StateData> {
      // Agent is the agent that made the call.
      agent: Agent<T>;
      // Network represents the network that this agent or lifecycle belongs to.
      network?: NetworkRun<T>;
    }

    export interface Result<T extends StateData> extends Base<T> {
      result: AgentResult;
    }

    export interface Before<T extends StateData> extends Base<T> {
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

  export interface RoutingLifecycle<T extends StateData> extends Lifecycle<T> {
    onRoute: RouterFn<T>;
  }

  export type RouterFn<T extends StateData> = (
    args: Agent.RouterArgs<T>
  ) => string[] | undefined;

  /**
   * Router args are the arguments passed to the onRoute lifecycle hook.
   */
  export type RouterArgs<T extends StateData> = Agent.LifecycleArgs.Result<T>;
}
