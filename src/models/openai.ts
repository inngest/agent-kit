import { openai, type GetStepTools, type Inngest, type OpenAi } from "inngest";
import { requestParser, responseParser } from "../adapters/openai";
import { AgenticModel } from "../model";

export namespace AgenticOpenAiModel {
  export interface Options<TAiAdapter extends OpenAi.AiModel>
    extends Omit<OpenAi.AiModelOptions, "model"> {
    model: OpenAi.AiModelOptions["model"] | TAiAdapter;
    step: GetStepTools<Inngest.Any>;
  }
}

export const agenticOpenai = <TAiAdapter extends OpenAi.AiModel>({
  step,
  ...modelOptions
}: AgenticOpenAiModel.Options<TAiAdapter>) => {
  const model =
    typeof modelOptions.model === "string"
      ? openai({ ...modelOptions, model: modelOptions.model })
      : modelOptions.model;

  return new AgenticModel({
    model,
    step,
    requestParser,
    responseParser,
  });
};
