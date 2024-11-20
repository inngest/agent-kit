import { InferInput, OpenAiProvider } from "inngest";
import { Agent } from "./agent";

export interface InternalNetworkMessage {
  role: "system" | "user" | "assistant" | "tool_result";
  content: string | Array<TextMessage> | ToolResult;
  tools?: ToolMessage[];
  // TODO: Images and multi-modality.
}

export type OpenAiMessageType = InferInput<OpenAiProvider>["messages"][number];

export interface TextMessage {
  type: "text";
  text: string;
}
export interface ToolMessage {
  type: "tool";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolResult {
  type: "tool_result";
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
} // TODO: Content types.

/**
 * NetworkState stores state (history) for a given network of agents.  The state
 * includes key-values, plus a stack of all agentic calls.
 *
 * From this, the chat history can be reconstructed (and manipulated) for each subsequent
 * agentic call.
 */
export class NetworkState {
  public kv: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: (key: string, value: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: (key: string) => any;
    delete: (key: string) => boolean;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _kv: Map<string, any>;

  private _history: InferenceResult[];

  constructor() {
    this._history = [];
    this._kv = new Map();

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
    };
  }

  /**
   * Results retursn a new array containing all past inference results in the network.
   * This array is safe to modify.
   */
  get results() {
    return this._history.slice();
  }

  /**
   * history returns the memory used for agentic calls based off of prior agentic calls.
   *
   */
  get history(): InternalNetworkMessage[] {
    return this._history.map((call) => call.history()).flat();
  }

  append(call: InferenceResult) {
    this._history.push(call);
  }
}

/**
 * InferenceResult represents a single agentic call as part of the network state.
 *
 */
export class InferenceResult {
  // toHistory is a function which formats this given call to history for future
  // agentic calls.
  //
  // You can set a custom history adapter by calling .withFormatter() within
  // lifecycles.  This allows you to change how future agentic calls interpret past
  // agentic calls.
  private _historyFormatter:
    | ((a: InferenceResult) => InternalNetworkMessage[])
    | undefined;

  constructor(
    // agent represents the agent for this inference call.
    public agent: Agent,

    // input represents the input passed into the agent's run method.
    public input: string,

    // instructions represents the input instructions - without any additional history - as
    // created by the agent.
    public instructions: InternalNetworkMessage[],

    // prompt represents the entire prompt sent to the inference call.  This includes instructions
    // and history from the current network state.
    public prompt: InternalNetworkMessage[],

    // output represents the parsed output.
    public output: InternalNetworkMessage[],

    // toolCalls represents output from any tools called by the agent.
    public toolCalls: InternalNetworkMessage[],

    // raw represents the raw API response from the call.  This is a JSON string, and the format
    // depends on the agent's Provider.
    public raw: string,
  ) {}

  withFormatter(f: (a: InferenceResult) => InternalNetworkMessage[]) {
    this._historyFormatter = f;
  }

  history(): InternalNetworkMessage[] {
    if (this._historyFormatter) {
      return this._historyFormatter(this);
    }

    // Return the default format, which turns all system prompts into assistant
    // prompts.
    const agent = this.agent;

    const history: InternalNetworkMessage[] = this.instructions.map(
      function (msg) {
        let content: string;
        if (typeof msg.content === "string") {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = msg.content.map((m) => m.text).join("\n");
        } else {
          // TODO `anyany`
          content = msg.content.content as string;
        }

        // Ensure that instructions are always as an assistant.
        return {
          ...msg,
          role: "assistant",
          content: `<agent>${agent.name}</agent>\n${content}`,
        };
      },
    );

    return history.concat(this.output).concat(this.toolCalls);
  }
}
