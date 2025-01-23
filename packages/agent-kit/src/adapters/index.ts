import { type AiAdapter, type AiAdapters } from "@inngest/ai";
import { type AgenticModel } from "../model";
import * as anthropic from "./anthropic";
import * as openai from "./openai";

export type Adapters = {
  [Format in AiAdapter.Format]: {
    request: AgenticModel.RequestParser<AiAdapters[Format]>;
    response: AgenticModel.ResponseParser<AiAdapters[Format]>;
  };
};

export const adapters: Adapters = {
  "openai-chat": {
    request: openai.requestParser,
    response: openai.responseParser,
  },
  anthropic: {
    request: anthropic.requestParser,
    response: anthropic.responseParser,
  },
};
