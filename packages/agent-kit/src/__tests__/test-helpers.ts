/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LanguageModel } from "ai";

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
      toolCallId: string;
      toolName: string;
      input: unknown;
    }>;
    finishReason: "stop" | "tool-calls";
  };
}

/**
 * Create a mock LanguageModel for testing.
 * By default returns a text response. Can return tool calls or throw errors.
 */
export function createMockModel(opts?: MockModelOptions): LanguageModel {
  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-model",
    supportedUrls: {},
    doGenerate: async (options: any) => {
      if (opts?.error) {
        throw opts.error;
      }

      if (opts?.handler) {
        const result = opts.handler(options.prompt);
        const content: any[] = [];
        if (result.text) {
          content.push({ type: "text", text: result.text });
        }
        for (const tc of result.toolCalls ?? []) {
          content.push({
            type: "tool-call",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.input,
          });
        }
        return {
          content,
          finishReason: result.finishReason,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      }

      const toolCallContent = (opts?.toolCalls ?? []).map((tc) => ({
        type: "tool-call" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.args,
      }));

      const textContent =
        opts?.text ?? (toolCallContent.length === 0 ? "Mock response" : "");

      const content: any[] = [];
      if (textContent) {
        content.push({ type: "text", text: textContent });
      }
      content.push(...toolCallContent);

      return {
        content,
        finishReason: toolCallContent.length > 0 ? "tool-calls" : "stop",
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },
    doStream: async () => {
      throw new Error("Not implemented");
    },
  } as unknown as LanguageModel;
}
