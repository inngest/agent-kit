/**
 * Adapters for Grok I/O to transform to/from internal network messages.
 * Grok is an exotic one, it is an OpenAI-compatible API,
 * but does not support strict mode Function Calling, requiring an adapter.
 *
 * @module
 */

import type { AiAdapter, Grok } from "inngest";
import type { AgenticModel } from "../model";
import {
  requestParser as openaiRequestParser,
  responseParser as openaiResponseParser,
} from "./openai";

/**
 * Parse a request from internal network messages to an OpenAI input.
 */
export const requestParser: AgenticModel.RequestParser<Grok.AiModel> = (
  model,
  messages,
  tools,
  tool_choice = "auto"
) => {
  const request: AiAdapter.Input<Grok.AiModel> = openaiRequestParser(
    model,
    messages,
    tools,
    tool_choice
  );

  // Grok does not support strict mode Function Calling, so we need to disable it
  request.tools = (request.tools || []).map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      strict: false,
    },
  }));

  return request;
};

/**
 * Parse a response from OpenAI output to internal network messages.
 */
export const responseParser: AgenticModel.ResponseParser<Grok.AiModel> =
  openaiResponseParser as AgenticModel.ResponseParser<Grok.AiModel>;
