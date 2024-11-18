import { GetStepTools, Inngest } from "inngest";
import { Message } from "./state";

export const openai = <TClient extends Inngest = Inngest>(model: string, step: GetStepTools<TClient>, opts?: { baseURL?: string, key?: string }) => {
  const base = opts?.baseURL || "https://api.openai.com/";

  return new Provider({
    step,
    opts: {
      model,
      format: "openai-chat",
      url: base + "v1/chat/completions",
      authKey: opts?.key || process.env.OPENAI_API_KEY,
    },
    requestParser: (input: Message[]) => {
      return {
        model,
        messages: input.map(m => {
          return {
            role: m.role,
            // TODO: Proper content parsing.
            content: m.content,
          };
        }),
      }
    },
    responseParser: (input: any): Message[] => {
      // TODO: Proper parsing.
      const choices = input?.choices || [];
      if (choices.length === 0) {
        return [];
      }

      // TODO: openai typing
      return choices.map((c: any) => {
        if (!c.message) {
          return undefined;
        }
        return {
          role: c.message.role,
          content: c.message.content,
        }
      }).filter(Boolean);
    },
  });
}

// TODO: Type the result based off of the provider type
export class Provider<TClient extends Inngest = Inngest> {
  #opts: RequestOpts

  step: GetStepTools<TClient>
  requestParser: RequestParser
  responseParser: ResponseParser

  constructor({ opts, step, requestParser, responseParser }: ProviderConstructor<TClient>) {
    this.#opts = opts
    this.step = step;
    this.requestParser = requestParser;
    this.responseParser = responseParser;
  }

  async infer(stepID: string, input: Message[]): Promise<InferenceResponse> {
    const result =  await this.step.ai.infer(stepID, {
      opts: this.#opts,
      body: this.parseRequest(input),
    });
    return [this.parseResponse(result), result];
  }

  parseRequest(input: Message[]): { [key: string]: any } {
    return this.requestParser(input);
  }

  parseResponse(output: any): Message[] {
    return this.responseParser(output);
  }
}

export type InferenceResponse<T = any> = [Message[], T];

interface ProviderConstructor<TClient extends Inngest = Inngest> {
  opts: RequestOpts
  step: GetStepTools<TClient>
  requestParser: RequestParser
  responseParser: ResponseParser
}

type RequestParser = (state: Message[]) => { [key: string]: any };

type ResponseParser = (input: unknown) => Message[];

interface RequestOpts {
  model: string
  url: string
  auth: string
  format: string
  headers: { [header: string]: string }
};

