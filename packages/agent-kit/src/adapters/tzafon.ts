/**
 * Adapters for Tzafon I/O to transform to/from internal network messages.
 *
 * Tzafon exposes an OpenAI-compatible chat completions API. Tool/function
 * calling support is model-dependent: the `northstar-*` models handle `tools`
 * and `tool_choice` and emit real tool calls, whereas the `sm-*` models are
 * deployed without a tool-call parser and reject those fields with a 400. For
 * the latter we strip `tools`/`tool_choice` from the request body; for models
 * that support tools we pass them through unchanged.
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
 * Model families that reject `tools`/`tool_choice` with a 400 and therefore
 * need those fields stripped from the request. Everything else (e.g. the
 * `northstar-*` computer-use models) supports tool calling and is left intact.
 */
const stripsToolSupport = (modelId: string | undefined): boolean =>
  /^tzafon\.sm-/.test(modelId ?? "");

/**
 * Parse a request from internal network messages to an OpenAI input. For
 * models that do not support tool calling, `tools` and `tool_choice` are
 * stripped to avoid a 400; other models keep them.
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

  if (stripsToolSupport(model.options?.model)) {
    delete request.tools;
    delete request.tool_choice;
  }

  return request;
};

/**
 * Parse a response from Tzafon output to internal network messages.
 */
export const responseParser: AgenticModel.ResponseParser<Tzafon.AiModel> =
  openaiResponseParser as unknown as AgenticModel.ResponseParser<Tzafon.AiModel>;
