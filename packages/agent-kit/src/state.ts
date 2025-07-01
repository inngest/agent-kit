import { type AgentResult, type Message } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StateData = Record<string, any>;

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
export const createState = <T extends StateData>(
  initialState?: T,
  opts?: Omit<State.Constructor<T>, "data">
): State<T> => {
  return new State({ ...opts, data: initialState });
};

/**
 * State stores state (history) for a given network of agents.  The state
 * includes a stack of all AgentResult items and strongly-typed data
 * modified via tool calls.
 *
 * From this, the chat history can be reconstructed (and manipulated) for each
 * subsequent agentic call.
 */
export class State<T extends StateData> {
  public data: T;
  public threadId?: string;

  private _data: T;

  /**
   * _results stores all agent results.  This is internal and is used to
   * track each call made in the network loop.
   */
  private _results: AgentResult[];

  /**
   * _messages stores a linear history of ALL messages from the current
   * network.  You can seed this with initial messages to create conversation
   * history.
   */
  private _messages: Message[];

  constructor({ data, messages, threadId, results }: State.Constructor<T> = {}) {
    this._results = results || [];
    this._messages = messages || [];
    this._data = data ? { ...data } : ({} as T);
    this.threadId = threadId;

    // Create a new proxy that allows us to intercept the setting of state.
    //
    // This will be used to add middleware hooks to record state
    // before and after setting.
    this.data = new Proxy(this._data, {
      set: (target, prop: string | symbol, value) => {
        if (typeof prop === "string" && prop in target) {
          // Update the property
          Reflect.set(target, prop, value);
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });

    // NOTE: KV is deprecated and should be fully typed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.#_kv = new Map<string, any>(Object.entries(this._data));
    this.kv = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set: (key: string, value: any) => {
        this.#_kv.set(key, value);
      },
      get: (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.#_kv.get(key);
      },
      delete: (key: string) => {
        return this.#_kv.delete(key);
      },
      has: (key: string) => {
        return this.#_kv.has(key);
      },
      all: () => {
        return Object.fromEntries(this.#_kv);
      },
    };
  }

  /**
   * Results returns a new array containing all past inference results in the
   * network. This array is safe to modify.
   */
  get results(): AgentResult[] {
    return this._results.slice();
  }

  /**
   * Replaces all results with the provided array
   * used when loading initial results from history.get()
   */
  setResults(results: AgentResult[]) {
    this._results = results;
  }

  /**
   * Returns a slice of results from the given start index
   * used when saving results to a database via history.appendResults()
   */
  getResultsFrom(startIndex: number): AgentResult[] {
    return this._results.slice(startIndex);
  }

  /**
   * Messages returns a new array containing all initial messages that were
   * provided to the constructor. This array is safe to modify.
   */
  get messages(): Message[] {
    return this._messages.slice();
  }

  /**
   * formatHistory returns the memory used for agentic calls based off of prior
   * agentic calls.
   *
   * This is used to format the current State as a conversation log when
   * calling an individual agent.
   *
   */
  formatHistory(formatter?: (r: AgentResult) => Message[]): Message[] {
    if (!formatter) {
      formatter = defaultResultFormatter;
    }

    // Always add any messages before any AgentResult items.  This allows
    // you to preload any
    return this._messages.concat(
      this._results.map((result) => formatter(result)).flat()
    );
  }

  /**
   * appendResult appends a given result to the current state.  This
   * is called by the network after each iteration.
   */
  appendResult(call: AgentResult) {
    this._results.push(call);
  }

  /**
   * clone allows you to safely clone the state.
   */
  clone() {
    const state = new State<T>({
      data: this.data,
      threadId: this.threadId,
      messages: this._messages.slice(),
      results: this._results.slice(),
    });
    return state;
  }

  /**
   * @deprecated Fully type state instead of using the KV.
   */
  public kv: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: <T = any>(key: string, value: T) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: <T = any>(key: string) => T | undefined;
    delete: (key: string) => boolean;
    has: (key: string) => boolean;
    all: () => Record<string, unknown>;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #_kv: Map<string, any>;
}

export namespace State {
  export type Constructor<T extends StateData> = {
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

const defaultResultFormatter = (r: AgentResult): Message[] => {
  return ([] as Message[]).concat(r.output).concat(r.toolCalls);
};
