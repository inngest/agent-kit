import {
  type AiAdapter,
  type GetStepTools,
  type Inngest,
  type OpenAi,
} from "inngest";
import { zodToJsonSchema } from "openai-zod-to-json-schema";
import { type InternalNetworkMessage, type ToolMessage } from "./state";
import { type Tool } from "./types";

export class AgenticModel<TAiAdapter extends AiAdapter> {
  #model: TAiAdapter;

  step: GetStepTools<Inngest.Any>;
  requestParser: AgenticModel.RequestParser<TAiAdapter>;
  responseParser: AgenticModel.ResponseParser<TAiAdapter>;

  constructor({
    model,
    step,
    requestParser,
    responseParser,
  }: AgenticModel.Constructor<TAiAdapter>) {
    this.#model = model;
    this.step = step;
    this.requestParser = requestParser;
    this.responseParser = responseParser;
  }

  async infer(
    stepID: string,
    input: InternalNetworkMessage[],
    tools: Tool.Any[],
  ): Promise<AgenticModel.InferenceResponse> {
    const result = (await this.step.ai.infer(stepID, {
      model: this.#model,
      body: this.requestParser(input, tools),
    })) as AiAdapter.Input<TAiAdapter>;

    return { output: this.responseParser(result), raw: result };
  }
}

export const createAgenticOpenAiModel = <TAiAdapter extends OpenAi.AiModel>({
  model,
  step,
}: {
  model: TAiAdapter;
  step: GetStepTools<Inngest.Any>;
}) => {
  return new AgenticModel({
    model,
    step,
    requestParser: (messages, tools) => {
      const request: AiAdapter.Input<TAiAdapter> = {
        messages: messages.map((m) => {
          return {
            role: m.role,
            content: m.content,
          };
        }) as AiAdapter.Input<TAiAdapter>["messages"],
      };

      if (tools?.length) {
        request.tools = tools.map((t) => {
          return {
            name: t.name,
            description: t.description,
            parameters: zodToJsonSchema(t.parameters),
            strict: true,
          };
        });
      }

      return request;
    },

    responseParser: (
      input: AiAdapter.Output<TAiAdapter>,
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

export namespace AgenticModel {
  export type Any = AgenticModel<AiAdapter>;

  /**
   * InferenceResponse is the response from a model for an inference request.
   * This contains parsed messages and the raw result, with the type of the raw
   * result depending on the model's API repsonse.
   */
  export type InferenceResponse<T = unknown> = {
    output: InternalNetworkMessage[];
    raw: T;
  };

  export interface Constructor<TAiAdapter extends AiAdapter> {
    model: TAiAdapter;
    step: GetStepTools<Inngest.Any>;
    requestParser: RequestParser<TAiAdapter>;
    responseParser: ResponseParser<TAiAdapter>;
  }

  export type RequestParser<TAiAdapter extends AiAdapter> = (
    state: InternalNetworkMessage[],
    tools: Tool.Any[],
  ) => AiAdapter.Input<TAiAdapter>;

  export type ResponseParser<TAiAdapter extends AiAdapter> = (
    output: AiAdapter.Output<TAiAdapter>,
  ) => InternalNetworkMessage[];
}
