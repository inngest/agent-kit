export interface Message {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text", text: string }>;
    // { type: "image", source: { type: "base64", media_type: string, data: string } } |
    // { type: "base64", media_type: string, data: string }
    // TODO: Tools & normalization of OpenAI and Anthropic
}

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
