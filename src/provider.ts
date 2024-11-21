import {
  OpenAiProvider,
  type GetStepTools,
  type InferInput,
  type InferOutput,
  type Inngest,
  type Provider as InngestAiProvider,
} from "inngest";
import { ToolMessage, type InternalNetworkMessage } from "./state";
import { type Tool } from "./types";
import { zodToJsonSchema } from 'openai-zod-to-json-schema'

export class AgenticProvider<TInngestProvider extends InngestAiProvider> {
  #provider: InngestAiProvider;

  step: GetStepTools<Inngest.Any>;
  requestParser: AgenticProvider.RequestParser<TInngestProvider>;
  responseParser: AgenticProvider.ResponseParser<TInngestProvider>;

  constructor({
    provider,
    step,
    requestParser,
    responseParser,
  }: AgenticProvider.Constructor<TInngestProvider>) {
    this.#provider = provider;
    this.step = step;
    this.requestParser = requestParser;
    this.responseParser = responseParser;
  }

  async infer(
    stepID: string,
    input: InternalNetworkMessage[],
    tools: Tool[],
  ): Promise<AgenticProvider.InferenceResponse> {
    const result = (await this.step.ai.infer(stepID, {
      provider: this.#provider,
      body: this.requestParser(input, tools),
    })) as InferOutput<TInngestProvider>;

    return { output: this.responseParser(result), raw: result };
  }
}

export const createAgenticOpenAiProvider = <
  TInngestProvider extends OpenAiProvider,
>({
  provider,
  step,
}: {
  provider: TInngestProvider;
  step: GetStepTools<Inngest.Any>;
}) => {
  return new AgenticProvider({
    provider,
    step,
    requestParser: (messages, tools) => {
      const request: InferInput<TInngestProvider> = {
        messages: messages.map((m) => {
          return {
            role: m.role,
            content: m.content,
          };
        }) as InferInput<TInngestProvider>["messages"],
      };

      if (tools?.length) {
        request.tools = tools.map((t) => {
          return {
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: zodToJsonSchema(t.parameters),
              strict: true,
            },
          };
        });
      }

      return request;
    },

    responseParser: (
      input: InferOutput<TInngestProvider>,
    ): InternalNetworkMessage[] => {
      return (input?.choices ?? []).reduce<InternalNetworkMessage[]>(
        (acc, choice) => {
          if (!choice.message) {
            return acc;
          }

          return [
            ...acc,
            {
              role: choice.message.role,
              content: choice.message.content,
              tools: (choice.message.tool_calls ?? []).map<ToolMessage>(
                (tool) => {
                  return {
                    type: "tool",
                    id: tool.id,
                    name: tool.function.name,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    input: JSON.parse(tool.function.arguments || "{}"),
                  };
                },
              ),
            } as InternalNetworkMessage,
          ];
        },
        [],
      );
    },
  });
};

export namespace AgenticProvider {
  export type Any = AgenticProvider<InngestAiProvider>;

  /**
   * InferenceResponse is the response from a provider for an inference request.
   * This contains parsed messages and the raw result, with the type of the raw
   * result depending on the provider's API repsonse.
   */
  export type InferenceResponse<T = unknown> = {
    output: InternalNetworkMessage[];
    raw: T;
  };

  export interface Constructor<TInngestProvider extends InngestAiProvider> {
    provider: TInngestProvider;
    step: GetStepTools<Inngest.Any>;
    requestParser: RequestParser<TInngestProvider>;
    responseParser: ResponseParser<TInngestProvider>;
  }

  export type RequestParser<TInngestProvider extends InngestAiProvider> = (
    state: InternalNetworkMessage[],
    tools: Tool[],
  ) => InferInput<TInngestProvider>;

  export type ResponseParser<TInngestProvider extends InngestAiProvider> = (
    output: InferOutput<TInngestProvider>,
  ) => InternalNetworkMessage[];
}
