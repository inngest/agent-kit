import { anthropic as ianthropic, type Anthropic } from "inngest";
import { requestParser, responseParser } from "../adapters/anthropic";
import { AgenticModel } from "../model";
import { type AnyStepTools } from "../types";

export namespace AnthropicModel {
  export interface Options<TAiAdapter extends Anthropic.AiModel>
    extends Omit<Anthropic.AiModelOptions, "model"> {
    /**
     * The Anthropic model to use.
     */
    model: Anthropic.AiModelOptions["model"] | TAiAdapter;

    /**
     * The step tools to use internally within this model.
     */
    step: AnyStepTools;
  }
}

/**
 * Create an agentic Anthropic model using the Anthropic chat format.
 */
export const anthropic = <TAiAdapter extends Anthropic.AiModel>({
  step,
  ...modelOptions
}: AnthropicModel.Options<TAiAdapter>) => {
  const model =
    typeof modelOptions.model === "string"
      ? ianthropic({ ...modelOptions, model: modelOptions.model })
      : modelOptions.model;

  return new AgenticModel({
    model,
    step,
    requestParser,
    responseParser,
  });
};
