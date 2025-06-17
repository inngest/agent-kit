import { type NetworkRun } from "./network";
import { type State, type StateData } from "./state";
import { type AgentResult } from "./types";
import { type GetStepTools, type Inngest } from "inngest";
import { type MaybePromise, getStepTools } from "./util";

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
export interface HistoryConfig<T extends StateData> {
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
  createThread?: (
    ctx: History.CreateThreadContext<T>
  ) => MaybePromise<{ threadId: string }>;

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
  appendResults?: (
    ctx: History.Context<T> & { 
      newResults: AgentResult[];
      userMessage?: {
        content: string;
        role: "user";
        timestamp: Date;
      };
    }
  ) => Promise<void>;
}

export namespace History {
  /**
   * Context provides access to the current state and execution context
   * when history hooks are called.
   * 
   * This context is passed to both `get` and `appendResults` hooks,
   * providing all necessary information for loading and saving conversation data.
   */
  export type Context<T extends StateData> = {
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
  export type CreateThreadContext<T extends StateData> = {
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
  export type Config<T extends StateData> = HistoryConfig<T>;
}

/**
 * Base configuration for thread operation functions.
 * 
 * Contains the common parameters needed by history utility functions
 * to perform thread operations like initialization, loading, and saving.
 */
export type ThreadOperationConfig<T extends StateData> = {
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
export type SaveThreadToStorageConfig<T extends StateData> = 
  ThreadOperationConfig<T> & {
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
export async function initializeThread<T extends StateData>(
  config: ThreadOperationConfig<T>
): Promise<void> {
  const { state, history, input, network } = config;
  if (!history) return;

  const step = await getStepTools();

  if (!state.threadId && history.createThread) {
    // Create a new thread using the provided createThread function
    const { threadId } = await history.createThread({
      state,
      network,
      input,
      step,
    });
    state.threadId = threadId;
  } else if (!state.threadId && history.get) {
    // Auto-generate a threadId if history.get is configured but no threadId was provided
    state.threadId = crypto.randomUUID();
    
    // Create a thread record in the database to ensure it exists
    // This prevents appendResults from failing when trying to save messages to a non-existent thread
    if (history.createThread) {
      await history.createThread({
        state,
        network,
        input,
        step,
      });
    }
  }
}

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
export async function loadThreadFromStorage<T extends StateData>(
  config: ThreadOperationConfig<T>
): Promise<void> {
  const { state, history, input, network } = config;
  if (!history?.get || !state.threadId || state.results.length > 0 || state.messages.length > 0) {
    return;
  }

  const step = await getStepTools();
  
  const historyResults = await history.get({
    state,
    network: network!,
    input,
    step,
    threadId: state.threadId,
  });
  
  // Replace any existing results with those from history
  state.setResults(historyResults);
}

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
export async function saveThreadToStorage<T extends StateData>(
  config: SaveThreadToStorageConfig<T>
): Promise<void> {
  const { state, history, input, initialResultCount, network } = config;
  if (!history?.appendResults) return;

  const step = await getStepTools();
  const newResults = state.getResultsFrom(initialResultCount);
  
  // Create user message object from input if input is provided
  const userMessage = input.trim() ? {
    content: input,
    role: "user" as const,
    timestamp: new Date(),
  } : undefined;
  
  await history.appendResults({
    state,
    network: network!,
    step,
    newResults,
    input,
    threadId: state.threadId,
    userMessage,
  });
} 