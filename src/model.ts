import { type AiAdapter } from "inngest";
import { type InternalNetworkMessage } from "./state";
import { type Tool } from "./types";
import { getStepTools } from "./util";
import { adapters } from "./adapters";

export const createAgenticModelFromAiAdapter = <
  TAiAdapter extends AiAdapter.Any,
>(
  adapter: TAiAdapter,
): AgenticModel<TAiAdapter> => {
  const opts = adapters[adapter.format as AiAdapter.Format];

  return new AgenticModel({
    model: adapter,
    requestParser:
      opts.request as unknown as AgenticModel.RequestParser<TAiAdapter>,
    responseParser:
      opts.response as unknown as AgenticModel.ResponseParser<TAiAdapter>,
  });
};

export class AgenticModel<TAiAdapter extends AiAdapter.Any> {
  #model: TAiAdapter;
  requestParser: AgenticModel.RequestParser<TAiAdapter>;
  responseParser: AgenticModel.ResponseParser<TAiAdapter>;

  constructor({
    model,
    requestParser,
    responseParser,
  }: AgenticModel.Constructor<TAiAdapter>) {
    this.#model = model;
    this.requestParser = requestParser;
    this.responseParser = responseParser;
  }

  async infer(
    stepID: string,
    input: InternalNetworkMessage[],
    tools: Tool.Any[],
  ): Promise<AgenticModel.InferenceResponse> {
    const step = await getStepTools();

    const result = (await step.ai.infer(stepID, {
      model: this.#model,
      body: this.requestParser(this.#model, input, tools),
    })) as AiAdapter.Input<TAiAdapter>;

    return { output: this.responseParser(result), raw: result };
  }
}

export namespace AgenticModel {
  export type Any = AgenticModel<AiAdapter.Any>;

  /**
   * InferenceResponse is the response from a model for an inference request.
   * This contains parsed messages and the raw result, with the type of the raw
   * result depending on the model's API repsonse.
   */
  export type InferenceResponse<T = unknown> = {
    output: InternalNetworkMessage[];
    raw: T;
  };

  export interface Constructor<TAiAdapter extends AiAdapter.Any> {
    model: TAiAdapter;
    requestParser: RequestParser<TAiAdapter>;
    responseParser: ResponseParser<TAiAdapter>;
  }

  export type RequestParser<TAiAdapter extends AiAdapter.Any> = (
    model: TAiAdapter,
    state: InternalNetworkMessage[],
    tools: Tool.Any[],
  ) => AiAdapter.Input<TAiAdapter>;

  export type ResponseParser<TAiAdapter extends AiAdapter.Any> = (
    output: AiAdapter.Output<TAiAdapter>,
  ) => InternalNetworkMessage[];
}
