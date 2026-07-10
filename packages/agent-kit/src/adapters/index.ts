import { type AiAdapter, type AiAdapters } from "@inngest/ai";
import { type AgenticModel } from "../model";
import * as anthropic from "./anthropic";
import * as openai from "./openai";
import * as azureOpenai from "./azure-openai";
import * as gemini from "./gemini";
import * as grok from "./grok";
import * as tzafon from "./tzafon";

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
  "azure-openai": {
    request: azureOpenai.requestParser,
    response: azureOpenai.responseParser,
  },
  anthropic: {
    request: anthropic.requestParser,
    response: anthropic.responseParser,
  },
  gemini: {
    request: gemini.requestParser,
    response: gemini.responseParser,
  },
  grok: {
    request: grok.requestParser,
    response: grok.responseParser,
  },
  tzafon: {
    request: tzafon.requestParser,
    response: tzafon.responseParser,
  },
};
