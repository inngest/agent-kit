import { type AiAdapter } from "@inngest/ai";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createRoutingAgent, type Agent, RoutingAgent } from "./agent";
import { createState, State, type StateData } from "./state";
import { createTool } from "./tool";
import type { AgentResult, Message, UserMessage } from "./types";
import { type MaybePromise } from "./util";
import {
  type HistoryConfig,
  initializeThread,
  loadThreadFromStorage,
  saveThreadToStorage,
} from "./history";
import {
  StreamingContext,
  createStepWrapper,
  generateId,
  type StreamingConfig,
} from "./streaming";
import { getStepTools } from "./util";

/**
 * Network represents a network of agents.
 */
export const createNetwork = <T extends StateData>(
  opts: Network.Constructor<T>
) => new Network(opts);

/**
 * Network represents a network of agents.
 */
export class Network<T extends StateData> {
  /**
   * The name for the system of agents
   */
  name: string;

  description?: string;

  /**
   * agents are all publicly available agents in the netwrok
   */
  agents: Map<string, Agent<T>>;

  /**
   * state is the entire agent's state.
   */
  state: State<T>;

  /**
   * defaultModel is the default model to use with the network.  This will not
   * override an agent's specific model if the agent already has a model defined
   * (eg. via withModel or via its constructor).
   */
  defaultModel?: AiAdapter.Any;

  router?: Network.Router<T>;

  /**
   * maxIter is the maximum number of times the we can call agents before ending
   * the network's run loop.
   */
  maxIter: number;

  // _stack is an array of strings, each representing an agent name to call.
  protected _stack: string[];

  protected _counter = 0;

  // _agents stores all agents.  note that you may not include eg. the
  // defaultRoutingAgent within the network constructor, and you may return an
  // agent in the router that's not included.  This is okay;  we store all
  // agents referenced in the router here.
  protected _agents: Map<string, Agent<T>>;

  /**
   * history config for managing thread creation and persistence
   * used to create a new thread, load initial results/history and
   * append new results to your database
   */
  public history?: HistoryConfig<T>;

  constructor({
    name,
    description,
    agents,
    defaultModel,
    maxIter,
    defaultState,
    router,
    defaultRouter,
    history,
  }: Network.Constructor<T>) {
    this.name = name;
    this.description = description;
    this.agents = new Map();
    this._agents = new Map();
    this.defaultModel = defaultModel;
    this.router = defaultRouter ?? router;
    this.maxIter = maxIter || 0;
    this._stack = [];
    this.history = history;

    if (defaultState) {
      this.state = defaultState;
    } else {
      this.state = createState<T>();
    }

    for (const agent of agents) {
      // Store all agents publicly visible.
      this.agents.set(agent.name, agent);
      // Store an internal map of all agents referenced.
      this._agents.set(agent.name, agent);
    }
  }

  async availableAgents(
    networkRun: NetworkRun<T> = new NetworkRun(this, new State())
  ): Promise<Agent<T>[]> {
    const available: Agent<T>[] = [];
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
  addAgent(agent: Agent<T>) {
    this.agents.set(agent.name, agent);
  }

  /**
   * run handles a given request using the network of agents.  It is not
   * concurrency-safe; you can only call run on a network once, as networks are
   * stateful.
   *
   */
  public run(
    ...[input, overrides]: Network.RunArgs<T>
  ): Promise<NetworkRun<T>> {
    let state: State<T>;
    if (overrides?.state) {
      if (overrides.state instanceof State) {
        state = overrides.state;
      } else {
        const stateObj = overrides.state as {
          data?: T;
          _messages?: Message[];
          _results?: AgentResult[];
        };
        state = new State<T>({
          data: stateObj.data || ({} as T),
          messages: stateObj._messages || [],
          results: stateObj._results || [],
        });
      }
    } else {
      state = this.state?.clone() || new State<T>();
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
let defaultRoutingAgent: RoutingAgent<any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

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

        // Check if the done tool was called
        if (tool.tool.name === "done") {
          return undefined; // Signal to exit the agent loop
        }

        // Check if select_agent was called
        if (tool.tool.name === "select_agent") {
          if (
            typeof tool.content === "object" &&
            tool.content !== null &&
            "data" in tool.content &&
            typeof tool.content.data === "string"
          ) {
            return [tool.content.data];
          }
        }

        return;
      },
    },

    tools: [
      createTool({
        name: "select_agent",
        description:
          "Select an agent to handle the next step of the conversation",
        parameters: z
          .object({
            name: z
              .string()
              .describe("The name of the agent that should handle the request"),
            reason: z
              .string()
              .optional()
              .describe("Brief explanation of why this agent was chosen"),
          })
          .strict(),
        handler: ({ name }, { network }) => {
          if (typeof name !== "string") {
            throw new Error("The routing agent requested an invalid agent");
          }

          const agent = network.agents.get(name);
          if (agent === undefined) {
            throw new Error(
              `The routing agent requested an agent that doesn't exist: ${name}`
            );
          }

          // This returns the agent name to call.  The default routing functon
          // schedules this agent by inpsecting this name via the tool call output.
          return agent.name;
        },
      }),

      createTool({
        name: "done",
        description:
          "Signal that the conversation is complete and no more agents need to be called",
        parameters: z
          .object({
            summary: z
              .string()
              .optional()
              .describe("Brief summary of what was accomplished"),
          })
          .strict(),
        handler: ({ summary }) => {
          // Return a completion message
          return summary || "Conversation completed successfully";
        },
      }),
    ],

    tool_choice: "any", // Allow the model to choose between select_agent or done

    system: async ({ network }): Promise<string> => {
      if (!network) {
        throw new Error(
          "The routing agent can only be used within a network of agents"
        );
      }

      const agents = await network?.availableAgents();

      return `You are the orchestrator between a group of agents. Each agent is suited for specific tasks and has a name, description, and tools.

The following agents are available:
<agents>
  ${agents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: Agent<any>) => {
      return `
    <agent>
      <name>${a.name}</name>
      <description>${a.description}</description>
      <tools>${JSON.stringify(Array.from(a.tools.values()))}</tools>
    </agent>`;
    })
    .join("\n")}
</agents>

Your responsibilities:
1. Analyze the conversation history and current state
2. Determine if the request has been completed or if more work is needed
3. Either:
   - Call select_agent to route to the appropriate agent for the next step
   - Call done if the conversation is complete or the user's request has been fulfilled

<instructions>
  - If the user's request has been addressed and no further action is needed, call the done tool
  - If more work is needed, select the most appropriate agent based on their capabilities
  - Consider the context and history when making routing decisions
  - Be efficient - don't route to agents unnecessarily if the task is complete
</instructions>`;
    },
  });

  return defaultRoutingAgent;
};

export namespace Network {
  export type Constructor<T extends StateData> = {
    name: string;
    description?: string;
    agents: Agent<T>[];
    defaultModel?: AiAdapter.Any;
    maxIter?: number;
    // state is any pre-existing network state to use in this Network instance.  By
    // default, new state is created without any history for every Network.
    defaultState?: State<T>;
    router?: Router<T>;
    defaultRouter?: Router<T>;
    history?: HistoryConfig<T>;
  };

  export type RunArgs<T extends StateData> = [
    input: UserMessage | string,
    overrides?: {
      router?: Router<T>;
      defaultRouter?: Router<T>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state?: State<T> | Record<string, any>;
      streaming?: StreamingConfig;
    },
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
  export type Router<T extends StateData> =
    | RoutingAgent<T>
    | Router.FnRouter<T>;

  export namespace Router {
    /**
     * FnRouter defines a function router which returns an Agent, an AgentRouter, or
     * undefined if the network should stop.
     *
     * If the FnRouter returns an AgentRouter (an agent with the .route function),
     * the agent will first be ran, then the `.route` function will be called.
     *
     */
    export type FnRouter<T extends StateData> = (
      args: Args<T>
    ) => MaybePromise<RoutingAgent<T> | Agent<T> | Agent<T>[] | undefined>;

    export interface Args<T extends StateData> {
      /**
       * input is the input called to the network (always the string content for backwards compatibility)
       */
      input: string;

      /**
       * userMessage is the rich UserMessage object if provided (new in Phase 1)
       * Contains client state, timestamps, and optional system prompts
       */
      userMessage?: UserMessage;

      /**
       * Network is the network that this router is coordinating.  Network state
       * is accessible via `network.state`.
       */
      network: NetworkRun<T>;

      /**
       * stack is an ordered array of agents that will be called next.
       */
      stack: Agent<T>[];

      /**
       * callCount is the number of current agent invocations that the network
       * has made.  This is a shorthand for `network.state.results.length`.
       */
      callCount: number;

      /**
       * lastResult is the last inference result that the network made.  This is
       * a shorthand for `network.state.results.pop()`.
       */
      lastResult?: AgentResult;
    }
  }
}

export class NetworkRun<T extends StateData> extends Network<T> {
  constructor(network: Network<T>, state: State<T>) {
    super({
      name: network.name,
      description: network.description,
      agents: Array.from(network.agents.values()),
      defaultModel: network.defaultModel,
      defaultState: network.state,
      router: network.router,
      maxIter: network.maxIter,
      history: network.history,
    });

    this.state = state;
  }

  public override run(): never {
    throw new Error("NetworkRun does not support run");
  }

  public override async availableAgents(): Promise<Agent<T>[]> {
    return super.availableAgents(this);
  }

  /**
   * Schedule is used to push an agent's run function onto the stack.
   */
  schedule(agentName: string) {
    this["_stack"].push(agentName);
  }

  private async execute(
    ...[input, overrides]: Network.RunArgs<T>
  ): Promise<this> {
    // Generate network run ID inside Inngest steps to ensure deterministic replay behavior
    const stepTools = await getStepTools();
    let networkRunId: string;

    if (stepTools) {
      // Use Inngest steps for deterministic ID generation
      networkRunId = await stepTools.run("generate-network-id", () => {
        return randomUUID();
      });
    } else {
      // Fallback for non-Inngest contexts
      networkRunId = randomUUID();
    }

    const streamingPublish = overrides?.streaming?.publish;
    let streamingContext: StreamingContext | undefined;

    // If history.get is configured AND the state is empty, use it to load initial history
    // When passing passing in messages from the client, history.get() is disabled - allowing the client to maintain conversation state and send it with each request
    // Enables a client-authoritative pattern where the UI maintains conversation state and sends it with each request. Allows `history.get()` to serve as a fallback for new threads or recovery

    // Extract string content for history functions that expect string input
    const inputContent = typeof input === 'object' && input !== null && 'content' in input 
      ? (input as UserMessage).content 
      : input as string;

    // Initialize conversation thread: Creates a new thread or auto-generates if needed
    // Capture whether the client provided a threadId BEFORE initialization. If absent, this
    // implies a brand-new thread and we can skip the initial history load (no-op DB read).
    const hadClientThreadId = Boolean(this.state.threadId);
    await initializeThread({
      state: this.state,
      history: this.history,
      input: inputContent,
      network: this,
    });

    // Persist the user's message at the beginning of the run for resilience
    if (this.history?.appendUserMessage) {
      let userMessage: { id: string; content: string; role: "user"; timestamp: Date };
      
      if (typeof input === 'object' && input !== null && 'id' in input) {
        // Input is a UserMessage object - extract data from it
        const userInput = input as UserMessage;
        userMessage = {
          id: userInput.id,
          content: userInput.content,
          role: "user",
          timestamp: userInput.clientTimestamp || new Date(),
        };
      } else {
        // Input is a string - generate a new ID
        userMessage = {
          id: randomUUID(),
          content: input as string,
          role: "user",
          timestamp: new Date(),
        };
      }
      
      await this.history.appendUserMessage({
        state: this.state,
        network: this,
        input: inputContent,
        threadId: this.state.threadId,
        userMessage,
        step: stepTools || undefined,
      });
    }

    // Load existing conversation history from storage only when the client provided a threadId.
    // If the threadId was omitted (new thread created this run), skip the initial get().
    if (hadClientThreadId) {
      await loadThreadFromStorage({
        state: this.state,
        history: this.history,
        input: inputContent,
        network: this,
      });
    }

    // Prepare streaming context after thread initialization
    if (streamingPublish) {
      streamingContext = StreamingContext.fromNetworkState(this.state, {
        publish: streamingPublish,
        runId: networkRunId,
        messageId: networkRunId, // Use networkRunId as messageId for network-level events
        scope: "network",
      });
      await streamingContext.publishEvent({
        event: "run.started",
        data: {
          runId: networkRunId,
          scope: "network",
          name: this.name,
          messageId: networkRunId, // Network events use networkRunId as messageId
          threadId: this.state.threadId,
        },
      });
    }

    // Wrap step tools for automatic step lifecycle events
    const step = await getStepTools();
    const wrappedStep = createStepWrapper(step, streamingContext);
    try {
    } catch {}

    const available = await this.availableAgents();
    if (available.length === 0) {
      throw new Error("no agents enabled in network");
    }

    // Store initial result count to track new results
    // Used to track new results in history.appendResults
    const initialResultCount = this.state.results.length;

    try {
      // If there's no default agent used to run the request, use our internal
      // routing agent which attempts to figure out the best agent to choose based
      // off of the network.
      const next = await this.getNextAgents(
        input, // Pass full UserMessage object, not extracted content
        overrides?.router || overrides?.defaultRouter || this.router
      );
      if (!next?.length) {
        // TODO: If call count is 0, error.
        return this;
      }

      // Schedule the agent to run on our stack, then start popping off the stack.
      for (const agent of next) {
        this.schedule(agent.name);
      }

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
          // Emit run.completed and stream.ended if streaming
          if (streamingContext) {
            await streamingContext.publishEvent({
              event: "run.completed",
              data: {
                runId: networkRunId,
                scope: "network",
                name: this.name,
                messageId: networkRunId, // Use networkRunId for network completion
              },
            });
            await streamingContext.publishEvent({
              event: "stream.ended",
              data: {
                scope: "network",
                messageId: networkRunId,
              },
            });
          }
          return this;
        }

        // We force Agent to emit structured output in case of the use of tools by
        // setting maxIter to 0.
        // Generate unique IDs for this agent's execution using durable steps
        let agentRunId: string;
        let agentMessageId: string;

        if (stepTools) {
          // Use Inngest steps for deterministic agent ID generation
          const agentIds = await stepTools.run(
            `generate-agent-ids-${this._counter}`,
            () => {
              return {
                agentRunId: generateId(),
                agentMessageId: randomUUID(),
              };
            }
          );
          agentRunId = agentIds.agentRunId;
          agentMessageId = agentIds.agentMessageId;
        } else {
          // Fallback for non-Inngest contexts
          agentRunId = generateId();
          agentMessageId = randomUUID();
        }

        // Create agent streaming context that shares the sequence counter
        let agentStreamingContext: StreamingContext | undefined;
        if (streamingContext) {
          // Create context with shared sequence counter but agent-specific messageId
          agentStreamingContext =
            streamingContext.createContextWithSharedSequence({
              runId: agentRunId,
              messageId: agentMessageId,
              scope: "agent",
            });

          await streamingContext.publishEvent({
            event: "run.started",
            data: {
              runId: agentRunId,
              parentRunId: networkRunId,
              scope: "agent",
              name: agent.name,
              messageId: agentMessageId, // Use agent-specific messageId
            },
          });
        }

        const call = await agent.run(inputContent, {
          network: this,
          maxIter: 0,
          // Provide streaming context so the agent can emit part/text/tool events
          streamingContext: agentStreamingContext,
          // Provide wrapped step tools for automatic step lifecycle events
          step: wrappedStep,
        });

        // CRITICAL FIX: Set the canonical message ID on the AgentResult
        // This ensures the streaming agentMessageId becomes the persisted message_id
        call.id = agentMessageId;

        if (agentStreamingContext) {
          await agentStreamingContext.publishEvent({
            event: "run.completed",
            data: {
              runId: agentRunId,
              scope: "agent",
              name: agent.name,
              messageId: agentMessageId, // Include agent-specific messageId in completion event
            },
          });
        }
        this._counter += 1;

        // Ensure that we store the call network history.
        this.state.appendResult(call);

        // Here we face a problem: what's the definition of done?   An agent may
        // have just been called with part of the information to solve an input.
        // We may need to delegate to another agent.
        //
        // In this case, we defer to the router provided to give us next steps.
        // By default, this is an agentic router which takes the current state,
        // agents, then figures out next steps.  This can, and often should, be
        // custom code.
        const next = await this.getNextAgents(
          input, // Pass full UserMessage object, not extracted content
          overrides?.router || overrides?.defaultRouter || this.router
        );

        for (const a of next || []) {
          this.schedule(a.name);
        }
      }

      // Save new network results to storage: Persists all new AgentResults generated
      // during this network run (from all agents that executed). Only saves the new
      // results, excluding any historical results that were loaded at the start.
      await saveThreadToStorage({
        state: this.state,
        history: this.history,
        input: inputContent,
        initialResultCount,
        network: this,
      });

    } catch (error) {
      // Emit error events for network streaming
      if (streamingContext) {
        try {
          await streamingContext.publishEvent({
            event: "run.failed",
            data: {
              runId: networkRunId,
              scope: "network",
              name: this.name,
              messageId: networkRunId, // Use networkRunId for network error events
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
      // Always emit completion events for network streaming
      if (streamingContext) {
        try {
          await streamingContext.publishEvent({
            event: "run.completed",
            data: {
              runId: networkRunId,
              scope: "network",
              name: this.name,
              messageId: networkRunId, // Use networkRunId for network completion in finally block
            },
          });
          await streamingContext.publishEvent({
            event: "stream.ended",
            data: {
              scope: "network",
              messageId: networkRunId,
            },
          });
        } catch (streamingError) {
          // Swallow streaming errors to prevent breaking the application
          console.warn("Failed to publish completion events:", streamingError);
        }
      }
    }

    return this;
  }

  private async getNextAgents(
    input: UserMessage | string,
    router?: Network.Router<T>
  ): Promise<Agent<T>[] | undefined> {
    // A router may do one of two things:
    //
    //   1. Return one or more Agents to run
    //   2. Return undefined, meaning we're done.
    //
    // It can do this by using code, or by calling routing agents directly.
    if (!router && !this.defaultModel) {
      throw new Error(
        "No router or model defined in network.  You must pass a router or a default model to use the built-in agentic router."
      );
    }
    if (!router) {
      router = getDefaultRoutingAgent();
    }
    if (router instanceof RoutingAgent) {
      // RoutingAgents expect string input, so extract content from UserMessage
      const inputContent = typeof input === 'object' && input !== null && 'content' in input 
        ? (input as UserMessage).content 
        : input as string;
      return await this.getNextAgentsViaRoutingAgent(router, inputContent);
    }

    // This is a function call which determines the next agent to call.  Note that the result
    // of this function call may be another RoutingAgent.
    const stack: Agent<T>[] = this._stack.map((name) => {
      const agent = this._agents.get(name);
      if (!agent) {
        throw new Error(`unknown agent in the network stack: ${name}`);
      }
      return agent;
    });

    // Extract string content for router (routers always receive string for backwards compatibility)
    const routerInputContent = typeof input === 'object' && input !== null && 'content' in input 
      ? (input as UserMessage).content 
      : input as string;

    const agent = await router({
      input: routerInputContent, // Always pass string content for backwards compatibility
      userMessage: typeof input === 'object' && input !== null && 'content' in input ? input as UserMessage : undefined,
      network: this,
      stack,
      lastResult: this.state.results[this.state.results.length - 1],
      callCount: this._counter,
    });

    if (!agent) {
      return;
    }
    if (agent instanceof RoutingAgent) {
      // Functions may also return routing agents - extract content for RoutingAgent
      const inputContent = typeof input === 'object' && input !== null && 'content' in input 
        ? (input as UserMessage).content 
        : input as string;
      return await this.getNextAgentsViaRoutingAgent(agent, inputContent);
    }

    for (const a of Array.isArray(agent) ? agent : [agent]) {
      // Ensure this agent is part of the network.  If not, we're going to
      // automatically add it.
      if (!this._agents.has(a.name)) {
        this._agents.set(a.name, a);
      }
    }

    return Array.isArray(agent) ? agent : [agent];
  }

  private async getNextAgentsViaRoutingAgent(
    routingAgent: RoutingAgent<T>,
    input: string
  ): Promise<Agent<T>[] | undefined> {
    const result = await routingAgent.run(input, {
      network: this,
      model: routingAgent.model || this.defaultModel,
    });

    const agentNames = routingAgent.lifecycles.onRoute({
      result,
      agent: routingAgent,
      network: this,
    });

    return (agentNames || [])
      .map((name) => this.agents.get(name))
      .filter(Boolean) as Agent<T>[];
  }
}
