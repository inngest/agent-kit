/**
 * Adapters for Azure OpenAI I/O to transform to/from internal network messages.
 * Inherits most functionality from the OpenAI adapter since Azure OpenAI is API-compatible.
 *
 * @module
 */

import { type AzureOpenAi } from "@inngest/ai"
import { type AgenticModel } from "../model"
import { requestParser as openAiRequestParser, responseParser as openAiResponseParser } from "./openai"

/**
 * Parse a request from internal network messages to an Azure OpenAI input.
 * Inherits from OpenAI request parser but updates error messages.
 */
export const requestParser: AgenticModel.RequestParser<AzureOpenAi.AiModel> = (model, messages, tools, tool_choice) => {
  return openAiRequestParser(model as any, messages, tools, tool_choice)
}

/**
 * Parse a response from Azure OpenAI output to internal network messages.
 * Inherits from OpenAI response parser but updates error messages.
 */
export const responseParser: AgenticModel.ResponseParser<AzureOpenAi.AiModel> = (input) => {
  if (input.error) {
    throw new Error(
      input.error.message ||
        `Azure OpenAI request failed: ${JSON.stringify(input.error)}`
    )
  }
  return openAiResponseParser(input)
}
