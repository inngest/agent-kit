import { type AiAdapter } from "inngest";
import { AIGatewayError } from "./error";
import { type InternalNetworkMessage } from "./state";
import { type Tool } from "./types";

export class AgenticModel<TAiAdapter extends AiAdapter> {
  #model: TAiAdapter;
  #inferOverride: AgenticModel.Infer<this> | undefined;

  // step: GetStepTools<Inngest.Any>;
  requestParser: AgenticModel.RequestParser<TAiAdapter>;
  responseParser: AgenticModel.ResponseParser<TAiAdapter>;

  constructor({
    model,
    // step,
    requestParser,
    responseParser,
  }: AgenticModel.Constructor<TAiAdapter>) {
    this.#model = model;
    // this.step = step;
    this.requestParser = requestParser.bind(this.#model);
    this.responseParser = responseParser.bind(this.#model);
  }

  #infer: AgenticModel.Infer<this> = async (stepID, input, tools) => {
    const initialUrl = new URL(this.#model.url || "");

    const {
      body,
      headers: extraHeaders,
      url = initialUrl,
    } = this.requestParser({
      model: this.#model,
      messages: input,
      tools,
      url: initialUrl,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extraHeaders,
    };

    let res: Response;

    try {
      res = await fetch(url, {
        body: JSON.stringify(body),
        headers,
      });
    } catch (err) {
      const msg =
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof err.message === "string"
          ? err.message
          : JSON.stringify(err);

      throw new AIGatewayError(`Failed to call model: ${msg}`);
    }

    if (!res.ok) {
      throw new AIGatewayError(
        `Failed to call model: ${res.status} ${res.statusText}; ${await res.text()}`,
      );
    }

    const output = (await res.json()) as AiAdapter.Output<TAiAdapter>;

    return {
      output: this.responseParser({
        model: this.#model,
        output,
      }),
      raw: output,
    };
  };

  public infer: AgenticModel.Infer<this> = (...args) => {
    if (this.#inferOverride) {
      return this.#inferOverride(...args);
    }

    return this.#infer(...args);
  };

  // public infer: AgenticModel.Infer = async (stepID, input, tools) => {
  //   return this.#infer(stepID, input, tools);
  //   // const result = (await this.step.ai.infer(stepID, {
  //   //   model: this.#model,
  //   //   body: this.requestParser(input, tools),
  //   // })) as AiAdapter.Input<TAiAdapter>;

  //   // return { output: this.responseParser(result), raw: result };
  // };

  public overrideInfer(fn: AgenticModel.Infer<this> | undefined): this {
    this.#inferOverride = fn;

    return this;
  }
}

export namespace AgenticModel {
  export type Any = AgenticModel<AiAdapter>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Infer<This extends AgenticModel<any>> = (
    this: This,
    stepId: string,
    input: InternalNetworkMessage[],
    tools: Tool.Any[],
  ) => Promise<InferenceResponse>;

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
    // step: GetStepTools<Inngest.Any>;
    requestParser: RequestParser<TAiAdapter>;
    responseParser: ResponseParser<TAiAdapter>;
  }

  export type RequestParser<TAiAdapter extends AiAdapter> = (ctx: {
    model: TAiAdapter;
    url: URL;
    messages: InternalNetworkMessage[];
    tools: Tool.Any[];
  }) => {
    body: AiAdapter.Input<TAiAdapter>;
    headers?: Record<string, string>;
    url?: URL;
  };

  export type ResponseParser<TAiAdapter extends AiAdapter> = (ctx: {
    model: TAiAdapter;
    output: AiAdapter.Output<TAiAdapter>;
  }) => InternalNetworkMessage[];
}
