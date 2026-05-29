/**
 * OrcaRouter model helper.
 *
 * OrcaRouter (https://www.orcarouter.ai) is an OpenAI-compatible LLM router
 * that exposes 150+ upstream models behind a single `/v1/chat/completions`
 * endpoint, plus an adaptive `orcarouter/auto` router that picks an upstream
 * per request. Because the API is OpenAI-compatible, this helper is a thin
 * wrapper around the `openai` model: it reuses the `openai-chat` adapter and
 * only changes the default base URL and the API key environment variable.
 *
 * @module
 */

import { type AiAdapter, type OpenAi, openai } from "@inngest/ai";

/**
 * Create an OrcaRouter model using the OpenAI-compatible chat format.
 *
 * By default it targets the `https://api.orcarouter.ai/v1` base URL and reads
 * the API key from the `ORCAROUTER_API_KEY` environment variable.
 *
 * @example
 * ```ts
 * import { createAgent, orcarouter } from "@inngest/agent-kit";
 *
 * const agent = createAgent({
 *   name: "Code writer",
 *   system: "You are an expert TypeScript programmer.",
 *   // `orcarouter/auto` lets OrcaRouter pick the best upstream per request.
 *   model: orcarouter({ model: "orcarouter/auto" }),
 * });
 * ```
 *
 * @see https://docs.orcarouter.ai
 */
export const orcarouter: AiAdapter.ModelCreator<
  [options: OrcaRouter.AiModelOptions],
  OrcaRouter.AiModel
> = (options) => {
  const apiKey = options.apiKey || processEnv("ORCAROUTER_API_KEY") || "";
  const baseUrl = options.baseUrl || "https://api.orcarouter.ai/v1";

  const adapter = openai({
    ...options,
    apiKey,
    baseUrl,
    model: options.model,
  });

  // `openai()` falls back to `OPENAI_API_KEY` when no key is provided. We've
  // already resolved the key from `ORCAROUTER_API_KEY`, so pin `authKey` to
  // avoid silently sending an OpenAI key to the OrcaRouter endpoint.
  adapter.authKey = apiKey;

  return adapter;
};

/**
 * Read an environment variable in a way that is safe across runtimes that may
 * not define `process` (e.g. some edge runtimes).
 */
const processEnv = (key: string): string | undefined => {
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
};

export namespace OrcaRouter {
  /**
   * IDs of models to use.
   *
   * `orcarouter/auto` is OrcaRouter's adaptive router (not a single model): it
   * selects an upstream per request based on your configured routing strategy.
   * The other entries are flagship upstream models; any of OrcaRouter's 150+
   * model IDs can also be passed as a free-form string.
   *
   * See the full catalog at https://www.orcarouter.ai/models.
   */
  export type Model =
    | (string & {})
    | "orcarouter/auto"
    | "openai/gpt-5.5"
    | "google/gemini-3-flash-preview"
    | "anthropic/claude-opus-4.7"
    | "grok/grok-4.3"
    | "deepseek/deepseek-v4-pro"
    | "minimax/minimax-m2.7"
    | "qwen/qwen3.6-flash";

  /**
   * Options for creating an OrcaRouter model.
   */
  export interface AiModelOptions extends Omit<OpenAi.AiModelOptions, "model"> {
    /**
     * ID of the model to use. Defaults to no model; pass `orcarouter/auto` to
     * let OrcaRouter pick the best upstream per request.
     */
    model: OrcaRouter.Model;

    /**
     * The OrcaRouter API key to use for authenticating your request. By default
     * we'll search for and use the `ORCAROUTER_API_KEY` environment variable.
     */
    apiKey?: string;

    /**
     * The base URL for the OrcaRouter API.
     *
     * @default "https://api.orcarouter.ai/v1"
     */
    baseUrl?: string;
  }

  /**
   * An OrcaRouter model. OrcaRouter is OpenAI-compatible, so it reuses the
   * OpenAI model type and the `openai-chat` adapter.
   */
  export type AiModel = OpenAi.AiModel;
}
