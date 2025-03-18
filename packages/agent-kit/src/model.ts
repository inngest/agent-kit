import { type AiAdapter } from "@inngest/ai";
import { adapters } from "./adapters";
import { type Message } from "./types";
import { type Tool } from "./tool";
import { getStepTools } from "./util";

export const createAgenticModelFromAiAdapter = <
  TAiAdapter extends AiAdapter.Any,
>(
  adapter: TAiAdapter
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
    input: Message[],
    tools: Tool.Any[],
    tool_choice: Tool.Choice
  ): Promise<AgenticModel.InferenceResponse> {
    const body = this.requestParser(this.#model, input, tools, tool_choice);
    let result: AiAdapter.Input<TAiAdapter>;

    const step = await getStepTools();

    if (step) {
      result = (await step.ai.infer(stepID, {
        model: this.#model,
        body,
      })) as AiAdapter.Input<TAiAdapter>;
    } else {
      // Allow the model to mutate options and body for this call
      const modelCopy = { ...this.#model };
      this.#model.onCall?.(modelCopy, body);

      const url = new URL(modelCopy.url || "");

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Make sure we handle every known format in `@inngest/ai`.
      const formatHandlers: Record<AiAdapter.Format, () => void> = {
        "openai-chat": () => {
          headers["Authorization"] = `Bearer ${modelCopy.authKey}`;
        },
        anthropic: () => {
          headers["x-api-key"] = modelCopy.authKey;
          headers["anthropic-version"] = "2023-06-01";
        },
        gemini: () => {},
        grok: () => {},
      };

      formatHandlers[modelCopy.format as AiAdapter.Format]();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result = await (
        await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
      ).json();
    }

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
    requestParser: RequestParser<TAiAdapter>;
    responseParser: ResponseParser<TAiAdapter>;
  }

  export type RequestParser<TAiAdapter extends AiAdapter.Any> = (
    model: TAiAdapter,
    state: Message[],
    tools: Tool.Any[],
    tool_choice: Tool.Choice
  ) => AiAdapter.Input<TAiAdapter>;

  export type ResponseParser<TAiAdapter extends AiAdapter.Any> = (
    output: AiAdapter.Output<TAiAdapter>
  ) => Message[];
}
