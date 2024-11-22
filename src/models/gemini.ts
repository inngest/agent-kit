import { gemini, type Gemini, type GetStepTools, type Inngest } from "inngest";
import { requestParser, responseParser } from "../adapters/openai";
import { AgenticModel } from "../model";

export namespace AgenticGeminiModel {
  export interface Options<TAiAdapter extends Gemini.AiModel>
    extends Omit<Gemini.AiModelOptions, "model"> {
    /**
     * The Gemini model to use.
     */
    model: Gemini.AiModelOptions["model"] | TAiAdapter;

    /**
     * The step tools to use internally within this model.
     */
    step: GetStepTools<Inngest.Any>;
  }
}

/**
 * Create an agentic Gemini model using the OpenAI chat format.
 *
 * By default it targets the `https://generativelanguage.googleapis.com/v1beta/`
 * base URL.
 */
export const agenticGemini = <TAiAdapter extends Gemini.AiModel>({
  step,
  ...modelOptions
}: AgenticGeminiModel.Options<TAiAdapter>) => {
  const model =
    typeof modelOptions.model === "string"
      ? gemini({ ...modelOptions, model: modelOptions.model })
      : modelOptions.model;

  return new AgenticModel({
    model,
    step,
    requestParser,
    responseParser,
  });
};
