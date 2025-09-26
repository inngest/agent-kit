import { type AiAdapter, type AzureOpenAi, type OpenAi } from "@inngest/ai";
import { type AgenticModel } from "../model";
import { requestParser as openaiRequestParser, responseParser as openaiResponseParser } from "./openai";

export const requestParser: AgenticModel.RequestParser<AzureOpenAi.AiModel> = (
  model,
  messages,
  tools,
  tool_choice = "auto"
) =>
  openaiRequestParser(
    model as unknown as OpenAi.AiModel,
    messages,
    tools,
    tool_choice
  ) as AiAdapter.Input<AzureOpenAi.AiModel>;

export const responseParser: AgenticModel.ResponseParser<AzureOpenAi.AiModel> = (
  output
) =>
  openaiResponseParser(
    output as unknown as AiAdapter.Output<OpenAi.AiModel>
  );
