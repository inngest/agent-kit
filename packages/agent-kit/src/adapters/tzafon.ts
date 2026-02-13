/**
 * Adapters for Tzafon I/O to transform to/from internal network messages.
 * Tzafon is an OpenAI-compatible API, but does not support tool/function
 * calling. Requests containing `tools` or `tool_choice` are rejected with
 * a 400 error, so this adapter strips them from the request body.
 *
 * @module
 */

import type { AiAdapter, OpenAi, Tzafon } from "@inngest/ai";
import type { AgenticModel } from "../model";
import {
  requestParser as openaiRequestParser,
  responseParser as openaiResponseParser,
} from "./openai";

/**
 * Parse a request from internal network messages to an OpenAI input,
 * stripping `tools` and `tool_choice` since Tzafon does not support them.
 */
export const requestParser: AgenticModel.RequestParser<Tzafon.AiModel> = (
  model,
  messages,
  tools,
  tool_choice = "auto"
) => {
  const request: AiAdapter.Input<Tzafon.AiModel> = openaiRequestParser(
    model as unknown as OpenAi.AiModel,
    messages,
    tools,
    tool_choice
  );

  delete request.tools;
  delete request.tool_choice;

  return request;
};

/**
 * Parse a response from Tzafon output to internal network messages.
 */
export const responseParser: AgenticModel.ResponseParser<Tzafon.AiModel> =
  openaiResponseParser as unknown as AgenticModel.ResponseParser<Tzafon.AiModel>;
