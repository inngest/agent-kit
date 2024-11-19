import { GetStepTools, Inngest } from "inngest";
import { Message, ToolMessage } from "./state";
import { Tool } from "./types";

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

  async infer(stepID: string, input: Message[], tools: Tool[]): Promise<InferenceResponse> {
    const result =  await this.step.ai.infer(stepID, {
      opts: this.#opts,
      body: this.requestParser(input, tools),
    });
    return [this.responseParser(result), result];
  }
}

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
    requestParser: (input: Message[], tools: Tool[]) => {
      const request: any = {
        model,
        messages: input.map(m => {
          return {
            role: m.role,
            // TODO: Proper content parsing.
            content: m.content || "",
            // Tool calling
          };
        }),
      };

      if (tools && tools.length > 0) {
        request.tools = tools.map(t => {
          return {
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
              strict: true, // XXX: allow overwriting?
            },
          };
        });
      }

      return request;
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
          tools: (c.message.tool_calls || []).map((tool: any): ToolMessage => {
            return {
              type: "tool",
              id: tool.id,
              name: tool.function.name,
              input: JSON.parse(tool.function.arguments || "{}"),
            };
          }),
        }
      }).filter(Boolean);
    },
  });
}


/**
 * InferenceResponse is the response from a provider for an inference request.  This contains
 * parsed messages and the raw result, with the type of the raw result depending on the provider's
 * API repsonse.
 *
 */
export type InferenceResponse<T = any> = {
  output: Message[];
  raw: T;
};

interface ProviderConstructor<TClient extends Inngest = Inngest> {
  opts: RequestOpts
  step: GetStepTools<TClient>
  requestParser: RequestParser
  responseParser: ResponseParser
}

type RequestParser = (state: Message[], tools: Tool[]) => { [key: string]: any };

type ResponseParser = (input: unknown) => Message[];

interface RequestOpts {
  model: string
  url: string
  auth: string
  format: string
  headers: { [header: string]: string }
};

