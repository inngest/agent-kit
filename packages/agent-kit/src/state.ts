import { type Agent } from "./agent";
import { type Message, type ToolResultMessage } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StateData = Record<string, any>;

export const createState = <T extends StateData>(
  initialState?: T
): State<T> => {
  return new State(initialState);
};

/**
 * State stores state (history) for a given network of agents.  The state
 * includes key-values, plus a stack of all agentic calls.
 *
 * From this, the chat history can be reconstructed (and manipulated) for each
 * subsequent agentic call.
 */
export class State<T extends StateData> {
  public data: T;

  private _data: T;
  private _history: InferenceResult[];

  constructor(initialState?: T) {
    this._history = [];
    this._data = initialState || ({} as T);

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
  }

  /**
   * Results returns a new array containing all past inference results in the
   * network. This array is safe to modify.
   */
  get results() {
    return this._history.slice();
  }

  /**
   * format returns the memory used for agentic calls based off of prior
   * agentic calls.
   *
   * This is used to format the current State as a conversation log when
   * calling an individual agent.
   *
   */
  format(): Message[] {
    return this._history.map((call) => call.format()).flat();
  }

  append(call: InferenceResult) {
    this._history.push(call);
  }

  clone() {
    const state = new State<T>();
    state._history = this._history.slice();
    state.data = { ...this.data };
    return state;
  }
}

/**
 * InferenceResult represents a single agentic call as part of the network
 * state.  This stores every input and ouput for a call.
 *
 */
export class InferenceResult {
  // toHistory is a function which formats this given call to history for future
  // agentic calls.
  //
  // You can set a custom history adapter by calling .withFormatter() within
  // lifecycles.  This allows you to change how future agentic calls interpret
  // past agentic calls.
  private _historyFormatter: ((a: InferenceResult) => Message[]) | undefined;

  constructor(
    // agent represents the agent for this inference call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public agent: Agent<any>,

    // input represents the input passed into the agent's run method.
    public input: string,

    // prompt represents the input instructions - without any additional history
    // - as created by the agent.  This includes the system prompt, the user input,
    // and any initial agent assistant message.
    public prompt: Message[],

    // history represents the history sent to the inference call, appended to the
    // prompt to form a complete conversation log
    public history: Message[],

    // output represents the parsed output from the inference call.  This may be blank
    // if the agent responds with tool calls only.
    public output: Message[],

    // toolCalls represents output from any tools called by the agent.
    public toolCalls: ToolResultMessage[],

    // raw represents the raw API response from the call.  This is a JSON
    // string, and the format depends on the agent's model.
    public raw: string
  ) {}

  withFormatter(f: (a: InferenceResult) => Message[]) {
    this._historyFormatter = f;
  }

  // format
  format(): Message[] {
    if (this._historyFormatter) {
      return this._historyFormatter(this);
    }

    if (this.raw === "") {
      // There is no call to the agent, so ignore this.
      return [];
    }

    // Return the default format, which turns all system prompts into assistant
    // prompts.
    const agent = this.agent;

    const messages = this.prompt
      .map((msg) => {
        if (msg.type !== "text") {
          return;
        }

        let content: string = "";
        if (typeof msg.content === "string") {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = msg.content.map((m) => m.text).join("\n");
        }

        // Ensure that system prompts are always as an assistant in history
        return {
          ...msg,
          type: "text",
          role: "assistant",
          content: `<agent>${agent.name}</agent>\n${content}`,
        };
      })
      .filter(Boolean);

    return (messages as Message[]).concat(this.output).concat(this.toolCalls);
  }
}
