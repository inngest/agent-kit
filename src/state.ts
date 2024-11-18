export interface Message {
  role: "system" | "user" | "assistant";
  content: string | Array<TextMessage>;
  tools?:  ToolMessage[];
  // TODO: Images and multi-modality.
}

interface TextMessage { type: "text", text: string };
interface ToolMessage { type: "tool", id: string; name: string; input: { [arg: string]: any } };

export class State {
  public kv: {
    set: (key: string, value: any) => void;
    get: (key: string) => any;
    delete: (key: string) => boolean;
  };

  private _kv: Map<string, any>;

  private _history: Message[];

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

  append(result: any) {
    // TODO: Handle OpenAI and Anthropic results.
  }
}
