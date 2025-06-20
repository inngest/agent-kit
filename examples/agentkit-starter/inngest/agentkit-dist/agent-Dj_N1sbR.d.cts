import { AiAdapter } from '@inngest/ai';
import { InngestFunction } from 'inngest/components/InngestFunction';
import { GetStepTools, Inngest } from 'inngest';
import { ZodType, ZodTypeAny, output } from 'zod';
import { AsyncContext } from 'inngest/experimental';
import { StreamableHTTPReconnectionOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

type Message = TextMessage | ToolCallMessage | ToolResultMessage;
/**
 * TextMessage represents plain text messages in the chat history, eg. the user's prompt or
 * an assistant's reply.
 */
interface TextMessage {
    type: "text";
    role: "system" | "user" | "assistant";
    content: string | Array<TextContent>;
    stop_reason?: "tool" | "stop";
}
/**
 * ToolCallMessage represents a message for a tool call.
 */
interface ToolCallMessage {
    type: "tool_call";
    role: "user" | "assistant";
    tools: ToolMessage[];
    stop_reason: "tool";
}
/**
 * ToolResultMessage represents the output of a tool call.
 */
interface ToolResultMessage {
    type: "tool_result";
    role: "tool_result";
    tool: ToolMessage;
    content: unknown;
    stop_reason: "tool";
}
interface TextContent {
    type: "text";
    text: string;
}
interface ToolMessage {
    type: "tool";
    id: string;
    name: string;
    input: Record<string, unknown>;
}
/**
 * AgentResult represents a single iteration of an agent call in the router
 * loop.  This includes the input prompt, the resulting messages, and any
 * tool call results.
 *
 * This is used in several ways:
 *
 *   1. To track the results of a given agent, including output and tool results.
 *   2. To construct chat history for each agent call in a network loop.
 *   3. To track what was sent to a given agent at any time.
 *
 *
 * ## Chat history and agent inputs in Networks.
 *
 * Networks call agents in a loop.  Each iteration of the loop adds to conversation
 * history.
 *
 * We construct the agent input by:
 *
 *   1. Taking the system prompt from an agent
 *   2. Adding the user request as a message
 *   3. If provided, adding the agent's assistant message.
 *
 * These two or three messages are ALWAYS the start of an agent's request:
 * [system, input, ?assistant].
 *
 * We then iterate through the state's AgentResult objects, adding the output
 * and tool calls from each result to chat history.
 *
 */
declare class AgentResult {
    #private;
    /**
     * agentName represents the name of the agent which created this result.
     */
    agentName: string;
    /**
     * output represents the parsed output from the inference call.  This may be blank
     * if the agent responds with tool calls only.
     */
    output: Message[];
    /**
     * toolCalls represents output from any tools called by the agent.
     */
    toolCalls: ToolResultMessage[];
    /**
     * createdAt represents when this message was created.
     */
    createdAt: Date;
    /**
     * prompt represents the input instructions - without any additional history
     * - as created by the agent.  This includes the system prompt, the user input,
     * and any initial agent assistant message.
     *
     * This is ONLY used for tracking and debugging purposes, and is entirely optional.
     * It is not used to construct messages for future calls, and only serves to see
     * what was sent to the agent in this specific request.
     */
    prompt?: Message[] | undefined;
    /**
     * history represents the history sent to the inference call, appended to the
     * prompt to form a complete conversation log.
     *
     * This is ONLY used for tracking and debugging purposes, and is entirely optional.
     * It is not used to construct messages for future calls, and only serves to see
     * what was sent to the agent in this specific request.
     */
    history?: Message[] | undefined;
    /**
     * raw represents the raw API response from the call.  This is a JSON
     * string, and the format depends on the agent's model.
     */
    raw?: string | undefined;
    constructor(
    /**
     * agentName represents the name of the agent which created this result.
     */
    agentName: string, 
    /**
     * output represents the parsed output from the inference call.  This may be blank
     * if the agent responds with tool calls only.
     */
    output: Message[], 
    /**
     * toolCalls represents output from any tools called by the agent.
     */
    toolCalls: ToolResultMessage[], 
    /**
     * createdAt represents when this message was created.
     */
    createdAt: Date, 
    /**
     * prompt represents the input instructions - without any additional history
     * - as created by the agent.  This includes the system prompt, the user input,
     * and any initial agent assistant message.
     *
     * This is ONLY used for tracking and debugging purposes, and is entirely optional.
     * It is not used to construct messages for future calls, and only serves to see
     * what was sent to the agent in this specific request.
     */
    prompt?: Message[] | undefined, 
    /**
     * history represents the history sent to the inference call, appended to the
     * prompt to form a complete conversation log.
     *
     * This is ONLY used for tracking and debugging purposes, and is entirely optional.
     * It is not used to construct messages for future calls, and only serves to see
     * what was sent to the agent in this specific request.
     */
    history?: Message[] | undefined, 
    /**
     * raw represents the raw API response from the call.  This is a JSON
     * string, and the format depends on the agent's model.
     */
    raw?: string | undefined);
    /**
     * export returns all fields necessary to store the AgentResult for future use.
     */
    export(): {
        agentName: string;
        output: Message[];
        toolCalls: ToolResultMessage[];
        createdAt: Date;
        checksum: string;
    };
    /**
     * checksum is a unique ID for this result.
     *
     * It is generated by taking a checksum of the message output and the created at date.
     * This allows you to dedupe items when saving conversation history.
     */
    get checksum(): string;
}

type StateData = Record<string, any>;
/**
 * createState creates new state for a given network.  You can add any
 * initial state data for routing, plus provide an object of previous
 * AgentResult objects or conversation history within Message.
 *
 * To store chat history, we strongly recommend serializing and storing
 * the list of AgentResult items from state after each network run.
 *
 * You can then load and pass those messages into this constructor to
 * create conversational memory.
 *
 * You can optionally pass a list of Message types in this constructor.
 * Any messages in this State will always be added after the system and
 * user prompt.
 */
declare const createState: <T extends StateData>(initialState?: T, opts?: Omit<State.Constructor<T>, "data">) => State<T>;
/**
 * State stores state (history) for a given network of agents.  The state
 * includes a stack of all AgentResult items and strongly-typed data
 * modified via tool calls.
 *
 * From this, the chat history can be reconstructed (and manipulated) for each
 * subsequent agentic call.
 */
declare class State<T extends StateData> {
    #private;
    data: T;
    threadId?: string;
    private _data;
    /**
     * _results stores all agent results.  This is internal and is used to
     * track each call made in the network loop.
     */
    private _results;
    /**
     * _messages stores a linear history of ALL messages from the current
     * network.  You can seed this with initial messages to create conversation
     * history.
     */
    private _messages;
    constructor({ data, messages, results, threadId }?: State.Constructor<T>);
    /**
     * Results returns a new array containing all past inference results in the
     * network. This array is safe to modify.
     */
    get results(): AgentResult[];
    /**
     * Replaces all results with the provided array
     * used when loading initial results from history.get()
     */
    setResults(results: AgentResult[]): void;
    /**
     * Returns a slice of results from the given start index
     * used when saving results to a database via history.appendResults()
     */
    getResultsFrom(startIndex: number): AgentResult[];
    /**
     * Messages returns a new array containing all initial messages that were
     * provided to the constructor. This array is safe to modify.
     */
    get messages(): Message[];
    /**
     * formatHistory returns the memory used for agentic calls based off of prior
     * agentic calls.
     *
     * This is used to format the current State as a conversation log when
     * calling an individual agent.
     *
     */
    formatHistory(formatter?: (r: AgentResult) => Message[]): Message[];
    /**
     * appendResult appends a given result to the current state.  This
     * is called by the network after each iteration.
     */
    appendResult(call: AgentResult): void;
    /**
     * clone allows you to safely clone the state.
     */
    clone(): State<T>;
    /**
     * @deprecated Fully type state instead of using the KV.
     */
    kv: {
        set: <T = any>(key: string, value: T) => void;
        get: <T = any>(key: string) => T | undefined;
        delete: (key: string) => boolean;
        has: (key: string) => boolean;
        all: () => Record<string, unknown>;
    };
}
declare namespace State {
    type Constructor<T extends StateData> = {
        /**
         * Data represents initial typed data
         */
        data?: T;
        /**
         * Results represents any previous AgentResult entries for
         * conversation history and memory.
         */
        results?: AgentResult[];
        /**
         * Messages allows you to pas custom messages which will be appended
         * after the system and user message to each agent.
         */
        messages?: Message[];
        /**
         * threadId is the unique identifier for a conversation thread.
         */
        threadId?: string;
    };
}

type MaybePromise<T> = T | Promise<T>;
/**
 * AnyZodType is a type alias for any Zod type.
 *
 * It specifically matches the typing used for the OpenAI JSON schema typings,
 * which do not use the standardized `z.ZodTypeAny` type.
 *
 * Not that using this type directly can break between any versions of Zod
 * (including minor and patch versions). It may be pertinent to maintain a
 * custom type which matches many versions in the future.
 */
type AnyZodType = ZodType<any> | ZodTypeAny;
/**
 * Given an unknown value, return a string representation of the error if it is
 * an error, otherwise return the stringified value.
 */
declare const stringifyError: (e: unknown) => string;
/**
 * Attempts to retrieve the step tools from the async context.
 */
declare const getStepTools: () => Promise<AsyncContext["ctx"]["step"] | undefined>;
declare const isInngestFn: (fn: unknown) => fn is InngestFunction.Any;
declare const getInngestFnInput: (fn: InngestFunction.Any) => AnyZodType | undefined;

/**
 * History configuration for managing conversation history in agents and networks.
 *
 * Provides hooks for creating threads, loading existing conversation history,
 * and persisting new results to storage. This enables persistent conversations
 * that can span multiple runs while maintaining context.
 *
 * @example
 * ```typescript
 * const history: HistoryConfig<MyStateType> = {
 *   createThread: async ({ state, input }) => {
 *     const threadId = await db.createThread(state.userId);
 *     return { threadId };
 *   },
 *   get: async ({ threadId }) => {
 *     return await db.getMessages(threadId);
 *   },
 *   appendResults: async ({ threadId, newResults, userMessage }) => {
 *     // Save user message first (if provided)
 *     if (userMessage) {
 *       await db.saveUserMessage(threadId, userMessage);
 *     }
 *     // Then save agent results
 *     await db.saveMessages(threadId, newResults);
 *   }
 * };
 * ```
 */
interface HistoryConfig<T extends StateData> {
    /**
     * createThread is called to create a new conversation thread if no
     * threadId is present in the state. It should return the new threadId.
     *
     * This hook is called during the initialization phase before any agents run,
     * allowing you to create a new conversation thread in your database and
     * return its identifier.
     *
     * @param ctx - Context containing state, input, and execution tools
     * @returns Promise resolving to an object with the new threadId
     */
    createThread?: (ctx: History.CreateThreadContext<T>) => MaybePromise<{
        threadId: string;
    }>;
    /**
     * get is called to load initial conversation history.
     * If provided, any results passed to createState will be ignored in favor
     * of the results returned by this function.
     *
     * This hook is called after thread initialization but before any agents run,
     * allowing you to hydrate the conversation state with previous messages
     * and context from your database.
     *
     * @param ctx - Context containing state, threadId, and execution tools
     * @returns Promise resolving to an array of previous AgentResults
     */
    get?: (ctx: History.Context<T>) => Promise<AgentResult[]>;
    /**
     * appendResults is called to save new results to storage after a network
     * or agent run completes. This receives only the new results that
     * were generated during the current run, excluding any historical results that
     * were loaded via history.get().
     *
     * This hook is called at the end of execution after all agents have run,
     * allowing you to persist both the user's input message and the new conversation
     * results to your database. The userMessage parameter contains the user's input
     * that triggered this conversation turn, enabling you to store complete conversation
     * history including both user and assistant messages.
     *
     * @param ctx - Context containing state, threadId, step, new results and user message
     * @returns Promise that resolves when results are successfully saved
     */
    appendResults?: (ctx: History.Context<T> & {
        newResults: AgentResult[];
        userMessage?: {
            content: string;
            role: "user";
            timestamp: Date;
        };
    }) => Promise<void>;
}
declare namespace History {
    /**
     * Context provides access to the current state and execution context
     * when history hooks are called.
     *
     * This context is passed to both `get` and `appendResults` hooks,
     * providing all necessary information for loading and saving conversation data.
     */
    type Context<T extends StateData> = {
        /** The current state containing user data and conversation context */
        state: State<T>;
        /** The network run instance for accessing network-level information */
        network: NetworkRun<T>;
        /** Inngest step tools for durable execution (when running in Inngest context) */
        step?: GetStepTools<Inngest.Any>;
        /** The user's input for this conversation turn */
        input: string;
        /** The thread identifier for this conversation (available for get/appendResults hooks) */
        threadId?: string;
    };
    /**
     * CreateThreadContext provides access to the current state and execution context
     * when the createThread hook is called. Note that threadId is not included since
     * that's what we're creating, and network is optional since createThread can be
     * called from both network and standalone agent contexts.
     *
     * This context is passed to the `createThread` hook when a new conversation
     * thread needs to be created.
     */
    type CreateThreadContext<T extends StateData> = {
        /** The current state containing user data */
        state: State<T>;
        /** The user's input for this conversation turn */
        input: string;
        /** Inngest step tools for durable execution (when running in Inngest context) */
        step?: GetStepTools<Inngest.Any>;
        /** The network run instance (optional - may not be available in standalone agent context) */
        network?: NetworkRun<T>;
    };
    /**
     * Config is an alias for HistoryConfig for consistency with other namespaces
     */
    type Config<T extends StateData> = HistoryConfig<T>;
}
/**
 * Base configuration for thread operation functions.
 *
 * Contains the common parameters needed by history utility functions
 * to perform thread operations like initialization, loading, and saving.
 */
type ThreadOperationConfig<T extends StateData> = {
    /** The current state containing conversation data and user context */
    state: State<T>;
    /** History configuration with hooks for thread operations */
    history?: HistoryConfig<T>;
    /** The user's input for this conversation turn */
    input: string;
    /** The network run instance (optional for standalone agent contexts) */
    network?: NetworkRun<T>;
};
/**
 * Configuration for saveThreadToStorage function - extends base config with initialResultCount.
 *
 * The initialResultCount is used to determine which results are "new" and should be
 * persisted, versus which results were loaded from history and should not be duplicated.
 */
type SaveThreadToStorageConfig<T extends StateData> = ThreadOperationConfig<T> & {
    /** The number of results that existed before this run started (used to identify new results) */
    initialResultCount: number;
};
/**
 * Handles thread initialization logic - creates new threads or auto-generates threadIds.
 *
 * This function is called at the beginning of agent/network runs to ensure a valid
 * thread context exists. It will:
 * 1. Create a new thread using the `createThread` hook if no threadId exists
 * 2. Auto-generate a threadId if `history.get` is configured but no threadId was provided
 * 3. Do nothing if a threadId already exists or no history configuration is provided
 *
 * @param config - Configuration containing state, history, input, and optional network
 * @returns Promise that resolves when thread initialization is complete
 *
 * @example
 * ```typescript
 * await initializeThread({
 *   state: myState,
 *   history: myHistoryConfig,
 *   input: userInput,
 *   network: networkRun
 * });
 * console.log(myState.threadId); // Now has a valid threadId
 * ```
 */
declare function initializeThread<T extends StateData>(config: ThreadOperationConfig<T>): Promise<void>;
/**
 * Loads conversation history from storage if conditions are met.
 *
 * This function retrieves previous conversation messages from storage and populates
 * the state with historical context. It will only load history if:
 * 1. A history.get hook is configured
 * 2. A threadId exists in the state
 * 3. The state doesn't already have results OR messages (to avoid overwriting client-provided data)
 *
 * When either results or messages are provided to createState, this enables client-authoritative
 * mode where the client maintains conversation state and sends it with each request.
 *
 * @param config - Configuration containing state, history, input, and optional network
 * @returns Promise that resolves when history loading is complete
 *
 * @example
 * ```typescript
 * await loadThreadFromStorage({
 *   state: myState,
 *   history: myHistoryConfig,
 *   input: userInput,
 *   network: networkRun
 * });
 * console.log(myState.results); // Now contains previous conversation messages
 * ```
 */
declare function loadThreadFromStorage<T extends StateData>(config: ThreadOperationConfig<T>): Promise<void>;
/**
 * Saves new conversation results to storage via history.appendResults.
 *
 * This function persists only the new AgentResults that were generated during
 * the current run, excluding any historical results that were loaded via `loadThreadFromStorage`.
 * This prevents duplication of messages in storage. Additionally, it passes the user's
 * input message to enable complete conversation history persistence.
 *
 * @param config - Configuration containing state, history, input, network, and initialResultCount
 * @returns Promise that resolves when results are successfully saved
 *
 * @example
 * ```typescript
 * const initialCount = state.results.length;
 * // ... run agents that add new results ...
 * await saveThreadToStorage({
 *   state: myState,
 *   history: myHistoryConfig,
 *   input: userInput,
 *   initialResultCount: initialCount,
 *   network: networkRun
 * });
 * ```
 */
declare function saveThreadToStorage<T extends StateData>(config: SaveThreadToStorageConfig<T>): Promise<void>;

/**
 * Network represents a network of agents.
 */
declare const createNetwork: <T extends StateData>(opts: Network.Constructor<T>) => Network<T>;
declare const getDefaultRoutingAgent: () => RoutingAgent<any>;
/**
 * Network represents a network of agents.
 */
declare class Network<T extends StateData> {
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
    protected _stack: string[];
    protected _counter: number;
    protected _agents: Map<string, Agent<T>>;
    /**
     * history config for managing thread creation and persistence
     * used to create a new thread, load initial results/history and
     * append new results to your database
     */
    history?: HistoryConfig<T>;
    constructor({ name, description, agents, defaultModel, maxIter, defaultState, router, defaultRouter, history, }: Network.Constructor<T>);
    availableAgents(networkRun?: NetworkRun<T>): Promise<Agent<T>[]>;
    /**
     * addAgent adds a new agent to the network.
     */
    addAgent(agent: Agent<T>): void;
    /**
     * run handles a given request using the network of agents.  It is not
     * concurrency-safe; you can only call run on a network once, as networks are
     * stateful.
     *
     */
    run(...[input, overrides]: Network.RunArgs<T>): Promise<NetworkRun<T>>;
}
declare namespace Network {
    type Constructor<T extends StateData> = {
        name: string;
        description?: string;
        agents: Agent<T>[];
        defaultModel?: AiAdapter.Any;
        maxIter?: number;
        defaultState?: State<T>;
        router?: Router<T>;
        defaultRouter?: Router<T>;
        history?: HistoryConfig<T>;
    };
    type RunArgs<T extends StateData> = [
        input: string,
        overrides?: {
            router?: Router<T>;
            defaultRouter?: Router<T>;
            state?: State<T> | Record<string, any>;
        }
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
    type Router<T extends StateData> = RoutingAgent<T> | Router.FnRouter<T>;
    namespace Router {
        /**
         * FnRouter defines a function router which returns an Agent, an AgentRouter, or
         * undefined if the network should stop.
         *
         * If the FnRouter returns an AgentRouter (an agent with the .route function),
         * the agent will first be ran, then the `.route` function will be called.
         *
         */
        type FnRouter<T extends StateData> = (args: Args<T>) => MaybePromise<RoutingAgent<T> | Agent<T> | Agent<T>[] | undefined>;
        interface Args<T extends StateData> {
            /**
             * input is the input called to the network
             */
            input: string;
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
declare class NetworkRun<T extends StateData> extends Network<T> {
    constructor(network: Network<T>, state: State<T>);
    run(): never;
    availableAgents(): Promise<Agent<T>[]>;
    /**
     * Schedule is used to push an agent's run function onto the stack.
     */
    schedule(agentName: string): void;
    private execute;
    private getNextAgents;
    private getNextAgentsViaRoutingAgent;
}

/**
 * createTool is a helper that properly types the input argument for a handler
 * based off of the Zod parameter types.
 */
declare function createTool<TInput extends Tool.Input, TState extends StateData>({ name, description, parameters, handler, }: {
    name: string;
    description?: string;
    parameters?: TInput;
    handler: (input: output<TInput>, opts: Tool.Options<TState>) => MaybePromise<any>;
}): Tool<TInput>;
type Tool<TInput extends Tool.Input> = {
    name: string;
    description?: string;
    parameters?: TInput;
    mcp?: {
        server: MCP.Server;
        tool: MCP.Tool;
    };
    strict?: boolean;
    handler: <TState extends StateData>(input: output<TInput>, opts: Tool.Options<TState>) => MaybePromise<any>;
};
declare namespace Tool {
    type Any = Tool<Tool.Input>;
    type Options<T extends StateData> = {
        agent: Agent<T>;
        network: NetworkRun<T>;
        step?: GetStepTools<Inngest.Any>;
    };
    type Input = AnyZodType;
    type Choice = "auto" | "any" | (string & {});
}
declare namespace MCP {
    type Server = {
        name: string;
        transport: TransportSSE | TransportWebsocket | TransportStreamableHttp;
    };
    type Transport = TransportSSE | TransportWebsocket | TransportStreamableHttp;
    type TransportStreamableHttp = {
        type: "streamable-http";
        url: string;
        requestInit?: RequestInit;
        reconnectionOptions?: StreamableHTTPReconnectionOptions;
        sessionId?: string;
        authProvider?: OAuthClientProvider;
    };
    type TransportSSE = {
        type: "sse";
        url: string;
        eventSourceInit?: EventSourceInit;
        requestInit?: RequestInit;
    };
    type TransportWebsocket = {
        type: "ws";
        url: string;
    };
    type Tool = {
        name: string;
        description?: string;
        inputSchema?: {
            type: "object";
            properties?: unknown;
        };
    };
}

/**
 * Agent represents a single agent, responsible for a set of tasks.
 */
declare const createAgent: <T extends StateData>(opts: Agent.Constructor<T>) => Agent<T>;
declare const createRoutingAgent: <T extends StateData>(opts: Agent.RoutingConstructor<T>) => RoutingAgent<T>;
declare class RoutingAgent<T extends StateData> extends Agent<T> {
    type: string;
    lifecycles: Agent.RoutingLifecycle<T>;
    constructor(opts: Agent.RoutingConstructor<T>);
    withModel(model: AiAdapter.Any): RoutingAgent<T>;
}
/**
 * Agent represents a single agent, responsible for a set of tasks.
 */
declare class Agent<T extends StateData> {
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
    system: string | ((ctx: {
        network?: NetworkRun<T>;
    }) => MaybePromise<string>);
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
    private history?;
    private _mcpClients;
    constructor(opts: Agent.Constructor<T> | Agent.RoutingConstructor<T>);
    private setTools;
    withModel(model: AiAdapter.Any): Agent<T>;
    /**
     * Run runs an agent with the given user input, treated as a user message.  If
     * the input is an empty string, only the system prompt will execute.
     */
    run(input: string, { model, network, state, maxIter }?: Agent.RunOptions<T> | undefined): Promise<AgentResult>;
    private performInference;
    /**
     * invokeTools takes output messages from an inference call then invokes any tools
     * in the message responses.
     */
    private invokeTools;
    private agentPrompt;
    private initMCP;
    /**
     * listMCPTools lists all available tools for a given MCP server
     */
    private listMCPTools;
    /**
     * mcpClient creates a new MCP client for the given server.
     */
    private mcpClient;
}
declare namespace Agent {
    interface Constructor<T extends StateData> {
        name: string;
        description?: string;
        system: string | ((ctx: {
            network?: NetworkRun<T>;
        }) => MaybePromise<string>);
        assistant?: string;
        tools?: (Tool.Any | InngestFunction.Any)[];
        tool_choice?: Tool.Choice;
        lifecycle?: Lifecycle<T>;
        model?: AiAdapter.Any;
        mcpServers?: MCP.Server[];
        history?: HistoryConfig<T>;
    }
    interface RoutingConstructor<T extends StateData> extends Omit<Constructor<T>, "lifecycle"> {
        lifecycle: RoutingLifecycle<T>;
    }
    interface RoutingConstructor<T extends StateData> extends Omit<Constructor<T>, "lifecycle"> {
        lifecycle: RoutingLifecycle<T>;
    }
    interface RoutingConstructor<T extends StateData> extends Omit<Constructor<T>, "lifecycle"> {
        lifecycle: RoutingLifecycle<T>;
    }
    interface RunOptions<T extends StateData> {
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
    interface Lifecycle<T extends StateData> {
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
            stop: boolean;
        }>;
        /**
         * onResponse is called after the inference call finishes, before any tools
         * have been invoked. This allows you to moderate the response prior to
         * running tools.
         */
        onResponse?: (args: Agent.LifecycleArgs.Result<T>) => MaybePromise<AgentResult>;
        /**
         * onFinish is called with a finalized AgentResult, including any tool
         * call results. The returned AgentResult will be saved to network
         * history, if the agent is part of the network.
         *
         */
        onFinish?: (args: Agent.LifecycleArgs.Result<T>) => MaybePromise<AgentResult>;
    }
    namespace LifecycleArgs {
        interface Base<T extends StateData> {
            agent: Agent<T>;
            network?: NetworkRun<T>;
        }
        interface Result<T extends StateData> extends Base<T> {
            result: AgentResult;
        }
        interface Before<T extends StateData> extends Base<T> {
            input?: string;
            prompt: Message[];
            history?: Message[];
        }
    }
    interface RoutingLifecycle<T extends StateData> extends Lifecycle<T> {
        onRoute: RouterFn<T>;
    }
    type RouterFn<T extends StateData> = (args: Agent.RouterArgs<T>) => string[] | undefined;
    /**
     * Router args are the arguments passed to the onRoute lifecycle hook.
     */
    type RouterArgs<T extends StateData> = Agent.LifecycleArgs.Result<T>;
}

export { Agent as A, saveThreadToStorage as B, type HistoryConfig as H, type Message as M, Network as N, RoutingAgent as R, type StateData as S, Tool as T, createRoutingAgent as a, createNetwork as b, createAgent as c, NetworkRun as d, createState as e, State as f, getDefaultRoutingAgent as g, createTool as h, MCP as i, type MaybePromise as j, type AnyZodType as k, getStepTools as l, isInngestFn as m, getInngestFnInput as n, type TextMessage as o, type ToolCallMessage as p, type ToolResultMessage as q, type TextContent as r, stringifyError as s, type ToolMessage as t, AgentResult as u, History as v, type ThreadOperationConfig as w, type SaveThreadToStorageConfig as x, initializeThread as y, loadThreadFromStorage as z };
