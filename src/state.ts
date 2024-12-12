import { type Agent } from "./agent";

export type Message = TextMessage | ToolCallMessage | ToolResultMessage;

/**
 * TextMessage represents plain text messages in the chat history, eg. the user's prompt or
 * an assistant's reply.
 */
export interface TextMessage {
  type: "text";
  role: "system" | "user" | "assistant";
  content: string | Array<TextContent>;
  // Anthropic:
  // stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  // OpenAI:
  // finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;
  stop_reason?: "tool" | "stop";
}

/**
 * ToolCallMessage represents a message for a tool call.
 */
export interface ToolCallMessage {
  type: "tool_call";
  role: "user" | "assistant";
  tools: ToolMessage[];
  stop_reason: "tool";
}

/**
 * ToolResultMessage represents the output of a tool call.
 */
export interface ToolResultMessage {
  type: "tool_result";
  role: "tool_result";
  // tool contains the tool call request for this result.
  tool: ToolMessage;
  content: unknown;
  stop_reason: "tool";
}

// Message content.

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolMessage {
  type: "tool";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * State stores state (history) for a given network of agents.  The state
 * includes key-values, plus a stack of all agentic calls.
 *
 * From this, the chat history can be reconstructed (and manipulated) for each
 * subsequent agentic call.
 */
export class State {
  public kv: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: <T = any>(key: string, value: T) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: <T = any>(key: string) => T | undefined;
    delete: (key: string) => boolean;
    has: (key: string) => boolean;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _kv: Map<string, any>;

  private _history: InferenceResult[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(state?: Record<string, any>) {
    this._history = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._kv = new Map<string, any>(state && Object.entries(state));

    this.kv = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set: (key: string, value: any) => {
        this._kv.set(key, value);
      },
      get: (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this._kv.get(key);
      },
      delete: (key: string) => {
        return this._kv.delete(key);
      },
      has: (key: string) => {
        return this._kv.has(key);
      },
    };
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
    const state = new State();
    state._history = this._history.slice();
    state._kv = new Map(this._kv);
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
    public agent: Agent,

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
    public raw: string,
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
