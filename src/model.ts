import { type AiAdapter, type GetStepTools, type Inngest } from "inngest";
import { type Message } from "./state";
import { type Tool } from "./types";

export class AgenticModel<TAiAdapter extends AiAdapter.Any> {
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
    input: Message[],
    tools: Tool.Any[],
  ): Promise<AgenticModel.InferenceResponse> {
    const result = (await this.step.ai.infer(stepID, {
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
    output: Message[];
    raw: T;
  };

  export interface Constructor<TAiAdapter extends AiAdapter.Any> {
    model: TAiAdapter;
    step: GetStepTools<Inngest.Any>;
    requestParser: RequestParser<TAiAdapter>;
    responseParser: ResponseParser<TAiAdapter>;
  }

  export type RequestParser<TAiAdapter extends AiAdapter.Any> = (
    model: TAiAdapter,
    state: Message[],
    tools: Tool.Any[],
  ) => AiAdapter.Input<TAiAdapter>;

  export type ResponseParser<TAiAdapter extends AiAdapter.Any> = (
    output: AiAdapter.Output<TAiAdapter>,
  ) => Message[];
}
