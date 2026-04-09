import { generateText, type LanguageModelV1 } from "ai";
import {
  messagesToCoreMessages,
  resultToMessages,
  toolsToAiTools,
  mapToolChoice,
  type SerializableResult,
} from "./converters";
import { type Message } from "./types";
import { type Tool } from "./tool";
import { getStepTools } from "./util";

export const createAgenticModelFromLanguageModel = (
  model: LanguageModelV1
): AgenticModel => {
  return new AgenticModel(model);
};

export class AgenticModel {
  #model: LanguageModelV1;

  constructor(model: LanguageModelV1) {
    this.#model = model;
  }

  async infer(
    stepID: string,
    input: Message[],
    tools: Tool.Any[],
    tool_choice: Tool.Choice
  ): Promise<AgenticModel.InferenceResponse> {
    const messages = messagesToCoreMessages(input);
    const aiTools = tools.length > 0 ? toolsToAiTools(tools) : undefined;

    const doInference = async (): Promise<SerializableResult> => {
      const result = await generateText({
        model: this.#model,
        messages,
        tools: aiTools,
        toolChoice: aiTools ? mapToolChoice(tool_choice) : undefined,
      });
      // Return only serializable fields for step.run() compatibility
      return {
        text: result.text,
        toolCalls: result.toolCalls.map((tc) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args as Record<string, unknown>,
        })),
        finishReason: result.finishReason,
      };
    };

    const step = await getStepTools();
    const result: SerializableResult = step
      ? await step.run(stepID, doInference)
      : await doInference();

    return { output: resultToMessages(result), raw: result };
  }
}

export namespace AgenticModel {
  export type Any = AgenticModel;

  /**
   * InferenceResponse is the response from a model for an inference request.
   * This contains parsed messages and the raw result, with the type of the raw
   * result depending on the model's API response.
   */
  export type InferenceResponse<T = unknown> = {
    output: Message[];
    raw: T;
  };
}
