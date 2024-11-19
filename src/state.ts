import { Agent } from "./agent";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | Array<TextMessage>;
  tools?:  ToolMessage[];
  // TODO: Images and multi-modality.
}

interface TextMessage { type: "text", text: string };
interface ToolMessage { type: "tool", id: string; name: string; input: { [arg: string]: any } };

/**
 * NetworkState stores state (history) for a given network of agents.  The state
 * includes key-values, plus a stack of all agentic calls.
 *
 * From this, the chat history can be reconstructed (and manipulated) for each subsequent
 * agentic call.
 */
export class NetworkState {
  public kv: {
    set: (key: string, value: any) => void;
    get: (key: string) => any;
    delete: (key: string) => boolean;
  };

  private _kv: Map<string, any>;

  private _history: AgenticCall[];

  constructor() {
    this._history = [];
    this._kv = new Map();

    this.kv = {
      set: (key: string, value: any) => {
        this._kv.set(key, value);
      },
      get: (key: string) => {
        return this._kv.get(key);
      },
      delete: (key: string) => {
        return this._kv.delete(key);
      },
    };
  }

  get history() {
    return this._history.slice();
  }

  append(call: AgenticCall) {
    this._history.push(call);
  }
}

/**
 * AgenticCall represents a single agentic call as part of the network state.
 *
 */
export class AgenticCall {
  constructor(
    // agent represents the agent for this inference call.
    public agent: Agent,

    // input represents the input passed into the agent's run method.
    public input: string,

    // instructions represents the input instructions - without any additional history - as
    // created by the agent.
    public instructions: Message[],

    // prompt represents the entire prompt sent to the inference call.  This includes instructions
    // and history from the current network state.
    public prompt: Message[],

    // output represents the parsed output.
    public output: Message[],

    // toolCalls represents output from any tools called by the agent.
    public toolCalls: Message[],

    // raw represents the raw API response from the call.  This is a JSON string, and the format
    // depends on the agent's Provider. 
    public raw: string,
  ) {}
}
