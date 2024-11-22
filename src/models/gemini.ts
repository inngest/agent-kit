import { gemini, type Gemini, type GetStepTools, type Inngest } from "inngest";
import { requestParser, responseParser } from "../adapters/openai";
import { AgenticModel } from "../model";

export namespace AgenticGeminiModel {
  export interface Options<TAiAdapter extends Gemini.AiModel>
    extends Omit<Gemini.AiModelOptions, "model"> {
    model: Gemini.AiModelOptions["model"] | TAiAdapter;
    step: GetStepTools<Inngest.Any>;
  }
}

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
