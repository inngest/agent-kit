import { type JSONSchema } from "@dmitryrechkin/json-schema-to-zod";
import { type AiAdapter } from "@inngest/ai";
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { type Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { EventSource } from "eventsource";
import { randomUUID } from "crypto";
import { referenceFunction, type Inngest, type GetStepTools } from "inngest";
import { errors } from "inngest/internals";
import { type InngestFunction } from "inngest";
import { type MinimalEventPayload } from "inngest/types";
import type { ZodType } from "zod";
import { createAgenticModelFromAiAdapter, type AgenticModel } from "./model";
import { createNetwork, NetworkRun } from "./network";
import { State, type StateData } from "./state";
import { type MCP, type Tool } from "./tool";
import {
  AgentResult,
  type Message,
  type ToolResultMessage,
  type UserMessage,
} from "./types";
import {
  getInngestFnInput,
  getStepTools,
  isInngestFn,
  type MaybePromise,
} from "./util";
import {
  type HistoryConfig,
  initializeThread,
  loadThreadFromStorage,
  saveThreadToStorage,
} from "./history";
// Streaming integration will be handled at the network level for now
import {
  StreamingContext,
  createStepWrapper,
  generateId,
  type StreamingConfig,
} from "./streaming";

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

  /**
   * history configuration for managing conversation history
   */
  private history?: HistoryConfig<T>;

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
    this.history = opts.history;
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
    input: UserMessage | string,
    {
      model,
      network,
      state,
      maxIter = 0,
      streaming,
      streamingContext,
      step,
    }: Agent.RunOptions<T> | undefined = {}
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

    // Handle standalone agent streaming (ignored if part of a network)
    let standaloneStreamingContext: StreamingContext | undefined;
    let standaloneWrappedStep: GetStepTools<Inngest.Any> | undefined;
    if (!network && streaming?.publish) {
      // Generate IDs for this standalone agent run using Inngest steps for deterministic replay
      const stepTools = await getStepTools();
      let agentRunId: string;
      let messageId: string;

      if (stepTools) {
        // Use Inngest steps for deterministic ID generation
        const ids = await stepTools.run("generate-standalone-agent-ids", () => {
          return {
            agentRunId: generateId(),
            messageId: randomUUID(),
          };
        });
        agentRunId = ids.agentRunId;
        messageId = ids.messageId;
      } else {
        // Fallback for non-Inngest contexts
        agentRunId = generateId();
        messageId = randomUUID();
      }

      // Create streaming context for this standalone agent
      standaloneStreamingContext = StreamingContext.fromNetworkState(s, {
        publish: streaming.publish,
        runId: agentRunId,
        messageId,
        scope: "agent",
        simulateChunking: streaming.simulateChunking,
      });

      // Create wrapped step for standalone agent streaming
      standaloneWrappedStep = createStepWrapper(
        stepTools,
        standaloneStreamingContext
      );

      // Emit agent run.started event
      await standaloneStreamingContext.publishEvent({
        event: "run.started",
        data: {
          runId: agentRunId,
          scope: "agent",
          name: this.name,
          messageId,
          threadId: s.threadId,
        },
      });
    }

    // Use standalone streaming context if available, otherwise use network-provided context
    const effectiveStreamingContext =
      streamingContext || standaloneStreamingContext;
    // Use standalone wrapped step if available, otherwise use network-provided step
    const effectiveStep: GetStepTools<Inngest.Any> | undefined =
      step || standaloneWrappedStep;

    // Note: Streaming is controlled at the network level when part of a network.
    // For standalone agents, streaming is controlled by the streaming parameter.

    // Extract string content for history functions that expect string input
    const inputContent =
      typeof input === "object" && input !== null && "content" in input
        ? input.content
        : input;

    // Initialize conversation thread: Creates a new thread or auto-generates if needed
    await initializeThread({
      state: s,
      history: this.history,
      input: inputContent,
      network: run,
    });

    // Load existing conversation history from storage: If threadId exists and history.get() is configured
    await loadThreadFromStorage({
      state: s,
      history: this.history,
      input: inputContent,
      network: run,
    });

    // Get formatted history and initial prompt
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

    // Store initial result count to track new results
    const initialResultCount = s.results.length;

    try {
      do {
        // Call lifecycles each time we perform inference.
        if (this.lifecycles?.onStart) {
          const modified = await this.lifecycles.onStart({
            agent: this,
            network: run,
            input: inputContent,
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
          p,
          prompt,
          history,
          run,
          effectiveStreamingContext,
          effectiveStep
        );

        hasMoreActions = Boolean(
          this.tools.size > 0 &&
            inference.output.length &&
            inference.output[inference.output.length - 1]!.stop_reason !==
              "stop"
        );

        result = inference;
        // Set the canonical message ID from streaming context for standalone agents
        if (standaloneStreamingContext) {
          result.id = standaloneStreamingContext.messageId;
        }
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

      // Save new conversation results to storage: Persists only the new AgentResults
      // generated during this run (excluding any historical results that were loaded).
      // This allows the conversation to be continued in future runs with full context.
      await saveThreadToStorage({
        state: s,
        history: this.history,
        input: inputContent,
        initialResultCount,
        network: run,
      });
    } catch (error) {
      // Emit error events for standalone agent streaming
      if (standaloneStreamingContext) {
        try {
          await standaloneStreamingContext.publishEvent({
            event: "run.failed",
            data: {
              runId: standaloneStreamingContext.runId,
              scope: "agent",
              name: this.name,
              error: error instanceof Error ? error.message : String(error),
              recoverable: false,
            },
          });
        } catch (streamingError) {
          // Swallow streaming errors to prevent masking the original error
          console.warn("Failed to publish run.failed event:", streamingError);
        }
      }
      // Re-throw the original error
      throw error;
    } finally {
      // Always emit completion events for standalone agent streaming
      if (standaloneStreamingContext) {
        try {
          await standaloneStreamingContext.publishEvent({
            event: "run.completed",
            data: {
              runId: standaloneStreamingContext.runId,
              scope: "agent",
              name: this.name,
            },
          });
          await standaloneStreamingContext.publishEvent({
            event: "stream.ended",
            data: {
              scope: "agent",
              messageId: standaloneStreamingContext.messageId,
            },
          });
        } catch (streamingError) {
          // Swallow streaming errors to prevent breaking the application
          console.warn("Failed to publish completion events:", streamingError);
        }
      }
    }

    return result;
  }

  private async performInference(
    p: AgenticModel.Any,
    prompt: Message[],
    history: Message[],
    network: NetworkRun<T>,
    streamingContext?: StreamingContext,
    step?: GetStepTools<Inngest.Any>
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

    // Fallback streaming of assistant text if streaming context exists
    if (streamingContext) {
      // Find the last assistant text message
      const lastTextMsg = [...result.output]
        .reverse()
        .find((m) => m.type === "text" && m.role === "assistant");
      let content = "";
      if (lastTextMsg && lastTextMsg.type === "text") {
        const anyMsg = lastTextMsg as unknown as {
          content: string | Array<{ type: "text"; text: string }>;
        };
        if (typeof anyMsg.content === "string") {
          content = anyMsg.content;
        } else if (Array.isArray(anyMsg.content)) {
          content = anyMsg.content.map((c) => c.text).join("");
        }
      }

      if (content && content.length > 0) {
        // Generate partId deterministically within a step to avoid replay issues
        const stepTools = step || (await getStepTools());
        const partId = stepTools
          ? await stepTools.run(
              `generate-text-part-id-${streamingContext.messageId}`,
              () => {
                return streamingContext.generatePartId();
              }
            )
          : streamingContext.generatePartId();

        await streamingContext.publishEvent({
          event: "part.created",
          data: {
            partId,
            runId: streamingContext.runId,
            messageId: streamingContext.messageId,
            type: "text",
            metadata: { agentName: this.name },
          },
        });

        if (streamingContext.isSimulatedChunking()) {
          const chunkSize = 50;
          for (let i = 0; i < content.length; i += chunkSize) {
            await streamingContext.publishEvent({
              event: "text.delta",
              data: {
                partId,
                messageId: streamingContext.messageId,
                delta: content.slice(i, i + chunkSize),
              },
            });
          }
        } else {
          // Single delta when not simulating chunking
          await streamingContext.publishEvent({
            event: "text.delta",
            data: {
              partId,
              messageId: streamingContext.messageId,
              delta: content,
            },
          });
        }

        await streamingContext.publishEvent({
          event: "part.completed",
          data: {
            partId,
            runId: streamingContext.runId,
            messageId: streamingContext.messageId,
            type: "text",
            finalContent: content,
          },
        });
      }
    }

    // And ensure we invoke any call from the agent, streaming tool I/O if possible
    const toolCallOutput = await this.invokeTools(
      result.output,
      network,
      streamingContext,
      step
    );
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
    network: NetworkRun<T>,
    streamingContext?: StreamingContext,
    step?: GetStepTools<Inngest.Any>
  ): Promise<ToolResultMessage[]> {
    const output: ToolResultMessage[] = [];
    // Best-effort streaming for tool execution: emit tool-call and output deltas via network streaming if available
    // Determine if a StreamingContext exists by checking for a symbol on step wrapper (not exposed); for now rely on model-level streaming additions later

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

        // Stream tool arguments if context available
        const toolArgsJson = JSON.stringify(tool.input ?? {});
        if (streamingContext) {
          // Generate partId deterministically within a step to avoid replay issues
          const stepTools = step || (await getStepTools());
          const toolCallPartId = stepTools
            ? await stepTools.run(
                `generate-tool-part-id-${streamingContext.messageId}-${tool.name}`,
                () => {
                  return streamingContext.generatePartId();
                }
              )
            : streamingContext.generatePartId();

          await streamingContext.publishEvent({
            event: "part.created",
            data: {
              partId: toolCallPartId,
              runId: streamingContext.runId,
              messageId: streamingContext.messageId,
              type: "tool-call",
              metadata: { toolName: tool.name, agentName: this.name },
            },
          });
          if (streamingContext.isSimulatedChunking()) {
            const argChunkSize = 50;
            for (let i = 0; i < toolArgsJson.length; i += argChunkSize) {
              await streamingContext.publishEvent({
                event: "tool_call.arguments.delta",
                data: {
                  partId: toolCallPartId,
                  delta: toolArgsJson.slice(i, i + argChunkSize),
                  toolName: i === 0 ? tool.name : undefined,
                  messageId: streamingContext.messageId,
                },
              });
            }
          } else {
            await streamingContext.publishEvent({
              event: "tool_call.arguments.delta",
              data: {
                partId: toolCallPartId,
                delta: toolArgsJson,
                toolName: tool.name,
                messageId: streamingContext.messageId,
              },
            });
          }
          await streamingContext.publishEvent({
            event: "part.completed",
            data: {
              partId: toolCallPartId,
              runId: streamingContext.runId,
              messageId: streamingContext.messageId,
              type: "tool-call",
              finalContent: tool.input ?? {},
              metadata: { toolName: tool.name, agentName: this.name },
            },
          });
        }

        // Call this tool.
        //
        // XXX: You might expect this to be wrapped in a step, but each tool can
        // use multiple step tools, eg. `step.run`, then `step.waitForEvent` for
        // human in the loop tasks.
        //

        type ToolHandlerResult =
          | { data: unknown }
          | { error: ReturnType<typeof errors.serializeError> };

        const result: ToolHandlerResult = await Promise.resolve(
          found.handler(tool.input, {
            agent: this,
            network,
            step: step as GetStepTools<Inngest.Any>,
          })
        )
          .then((r) => {
            return {
              data:
                typeof r === "undefined"
                  ? `${tool.name} successfully executed`
                  : r,
            };
          })
          .catch((err: Error) => {
            return { error: errors.serializeError(err) };
          });

        // Stream tool output if context available
        if (streamingContext) {
          // Generate partId deterministically within a step to avoid replay issues
          const stepTools = step || (await getStepTools());
          const outputPartId = stepTools
            ? await stepTools.run(
                `generate-output-part-id-${streamingContext.messageId}-${tool.name}`,
                () => {
                  return streamingContext.generatePartId();
                }
              )
            : streamingContext.generatePartId();

          await streamingContext.publishEvent({
            event: "part.created",
            data: {
              partId: outputPartId,
              runId: streamingContext.runId,
              messageId: streamingContext.messageId,
              type: "tool-output",
              metadata: { toolName: tool.name, agentName: this.name },
            },
          });

          const resultJson = JSON.stringify(result);
          if (streamingContext.isSimulatedChunking()) {
            const outChunk = 80;
            for (let i = 0; i < resultJson.length; i += outChunk) {
              await streamingContext.publishEvent({
                event: "tool_call.output.delta",
                data: {
                  partId: outputPartId,
                  delta: resultJson.slice(i, i + outChunk),
                  messageId: streamingContext.messageId,
                },
              });
            }
          } else {
            await streamingContext.publishEvent({
              event: "tool_call.output.delta",
              data: {
                partId: outputPartId,
                delta: resultJson,
                messageId: streamingContext.messageId,
              },
            });
          }

          await streamingContext.publishEvent({
            event: "part.completed",
            data: {
              partId: outputPartId,
              runId: streamingContext.runId,
              messageId: streamingContext.messageId,
              type: "tool-output",
              finalContent: result,
              metadata: { toolName: tool.name, agentName: this.name },
            },
          });
        }

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
    input: UserMessage | string,
    network?: NetworkRun<T>
  ): Promise<Message[]> {
    // Prompt returns the full prompt for the current agent.  This does NOT
    // include the existing network's state as part of the prompt.
    //
    // Note that the agent's system message always comes first.
    const systemContent =
      typeof this.system === "string"
        ? this.system
        : await this.system({ network });

    // Extract content and optional system prompt from input
    const inputContent =
      typeof input === "object" && input !== null && "content" in input
        ? input.content
        : input;

    const userSystemPrompt =
      typeof input === "object" && input !== null && "systemPrompt" in input
        ? input.systemPrompt
        : undefined;

    const messages: Message[] = [
      {
        type: "text",
        role: "system",
        content: userSystemPrompt
          ? `${systemContent}\n\n${userSystemPrompt}`
          : systemContent,
      },
    ];

    if (inputContent.length > 0) {
      messages.push({ type: "text", role: "user", content: inputContent });
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
    const { JSONSchemaToZod } = await import(
      "@dmitryrechkin/json-schema-to-zod"
    );
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
          // The converter may return a Zod v3 schema type; coerce to v4 type or fallback
          zschema = JSONSchemaToZod.convert(
            t.inputSchema as JSONSchema
          ) as unknown as ZodType;
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
        case "stdio": {
          const { command, args, env } = server.transport;
          const safeProcessEnv = Object.fromEntries(
            Object.entries(process.env).filter(([, v]) => v !== undefined)
          ) as Record<string, string>;
          const finalEnv = { ...safeProcessEnv, ...env };
          return new StdioClientTransport({
            command,
            args,
            env: finalEnv,
          });
        }
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
    history?: HistoryConfig<T>;
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
    /**
     * Streaming configuration for standalone agent runs. When provided, the agent will
     * automatically emit streaming events throughout its execution. Note: this is ignored
     * when the agent is run within a network, as networks control streaming.
     */
    streaming?: StreamingConfig;
    // Internal: provided by Network to enable runtime streaming from agents
    streamingContext?: StreamingContext;
    // Internal: provided by Network to pass wrapped step tools for automatic step events
    step?: GetStepTools<Inngest.Any>;
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
