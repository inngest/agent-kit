/**
 * Adapters for Anthropic I/O to transform to/from internal network messages.
 *
 * @module
 */
import {
  type AnthropicAiAdapter,
  type AiAdapter,
  type Anthropic,
} from "inngest";
import { zodToJsonSchema } from "openai-zod-to-json-schema";
import { type AgenticModel } from "../model";
import { type InternalNetworkMessage } from "../state";

/**
 * Parse a request from internal network messages to an Anthropic input.
 */
export const requestParser: AgenticModel.RequestParser<Anthropic.AiModel> = (
  model,
  messages,
  tools,
) => {
  // Note that Anthropic has a top-level system prompt, then a series of prompts
  // for assistants and users.
  const systemMessage = messages.find((m) => m.role === "system");
  const system =
    typeof systemMessage?.content === "string" ? systemMessage.content : "";

  const request: AiAdapter.Input<Anthropic.AiModel> = {
    system,
    model: model.options.model,
    max_tokens: model.options.max_tokens,
    messages: messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        return {
          role: m.role,
          content: m.content,
        };
      }) as AiAdapter.Input<Anthropic.AiModel>["messages"],
  };

  if (tools?.length) {
    request.tools = tools.map((t) => {
      return {
        name: t.name,
        description: t.description,
        input_schema: zodToJsonSchema(
          t.parameters,
        ) as AnthropicAiAdapter.Tool.InputSchema,
      };
    });
  }

  return request;
};

/**
 * Parse a response from Anthropic output to internal network messages.
 */
export const responseParser: AgenticModel.ResponseParser<Anthropic.AiModel> = (
  input,
) => {
  return (input?.content ?? []).reduce<InternalNetworkMessage[]>(
    (acc, item) => {
      if (!item.type) {
        return acc;
      }

      switch (item.type) {
        case "text":
          return [
            ...acc,
            {
              role: input.role,
              content: item.text,
            },
          ];
        case "tool_use": {
          let args;
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            args =
              typeof item.input === "string"
                ? JSON.parse(item.input)
                : item.input;
          } catch {
            args = item.input;
          }

          return [
            ...acc,
            {
              role: input.role,
              content: "",
              tools: [
                {
                  type: "tool",
                  id: item.id,
                  name: item.name,
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                  input: args,
                },
              ],
            },
          ];
        }
      }

      return acc;
    },
    [],
  );
};
