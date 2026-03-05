import type { LanguageModelV1 } from "ai";

export interface MockModelOptions {
  text?: string;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  error?: Error;
  /** If provided, called with the prompt to decide the response dynamically. */
  handler?: (prompt: unknown) => {
    text?: string;
    toolCalls?: Array<{
      toolCallType: "function";
      toolCallId: string;
      toolName: string;
      args: string;
    }>;
    finishReason: "stop" | "tool-calls";
  };
}

/**
 * Create a mock LanguageModelV1 for testing.
 * By default returns a text response. Can return tool calls or throw errors.
 */
export function createMockModel(opts?: MockModelOptions): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: "mock",
    modelId: "mock-model",
    defaultObjectGenerationMode: "json",
    doGenerate: async (options) => {
      if (opts?.error) {
        throw opts.error;
      }

      if (opts?.handler) {
        const result = opts.handler(options.prompt);
        return {
          text: result.text ?? "",
          toolCalls: result.toolCalls ?? [],
          finishReason: result.finishReason,
          usage: { promptTokens: 0, completionTokens: 0 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      }

      const toolCalls = (opts?.toolCalls ?? []).map((tc) => ({
        toolCallType: "function" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: JSON.stringify(tc.args),
      }));

      return {
        text: opts?.text ?? (toolCalls.length === 0 ? "Mock response" : ""),
        toolCalls,
        finishReason:
          toolCalls.length > 0
            ? ("tool-calls" as const)
            : ("stop" as const),
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
    doStream: async () => {
      throw new Error("Not implemented");
    },
  };
}
