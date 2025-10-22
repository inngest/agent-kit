/**
 * Vercel AI Gateway model creator.
 *
 * The Vercel AI Gateway provides unified access to 20+ AI providers through
 * an OpenAI-compatible API endpoint.
 *
 * @module
 */

import { openai, type OpenAi } from "@inngest/ai";

/**
 * Configuration options for the Vercel AI Gateway.
 */
export interface GatewayOptions {
  /**
   * The model to use in the format: provider/model
   * Examples: "openai/gpt-4", "anthropic/claude-sonnet-4", "xai/grok-3-beta"
   */
  model: string;

  /**
   * Your Vercel AI Gateway API key
   */
  apiKey?: string;

  /**
   * Custom gateway endpoint URL
   * @default "https://ai-gateway.vercel.sh/v1/chat/completions"
   */
  gatewayUrl?: string;

  /**
   * Default parameters to pass to the model
   */
  defaultParameters?: OpenAi.AiModelOptions["defaultParameters"];
}

/**
 * Create a model instance configured for Vercel AI Gateway.
 *
 * The Vercel AI Gateway is OpenAI-compatible, allowing you to route requests
 * through a unified endpoint that supports multiple providers.
 *
 * @example
 * ```typescript
 * import { gateway, createAgent, createNetwork } from "@inngest/agent-kit";
 *
 * const network = createNetwork({
 *   name: "my-network",
 *   agents: [myAgent],
 *   defaultModel: gateway({
 *     model: "anthropic/claude-sonnet-4",
 *     apiKey: process.env.AI_GATEWAY_API_KEY,
 *   }),
 * });
 * ```
 *
 * @param options - Configuration options for the gateway
 * @returns An OpenAI-compatible model configured for the Vercel AI Gateway
 */
export function gateway(options: GatewayOptions): OpenAi.AiModel {
  const {
    model,
    apiKey = process.env.AI_GATEWAY_API_KEY || "",
    gatewayUrl = "https://ai-gateway.vercel.sh/v1/chat/completions",
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    defaultParameters = {},
  } = options;

  // Create an OpenAI model with custom configuration for the gateway
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const gatewayModel = openai({
    model,
    apiKey,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    defaultParameters,
  });

  // Override the URL to point to the Vercel AI Gateway endpoint
  return {
    ...gatewayModel,
    url: gatewayUrl,
    authKey: apiKey,
  };
}
