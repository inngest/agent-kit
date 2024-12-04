/**
 * Adapters for OpenAI I/O to transform to/from internal network messages.
 *
 * @module
 */

import { type AiAdapter, type OpenAi } from "inngest";
import { zodToJsonSchema } from "openai-zod-to-json-schema";
import { type AgenticModel } from "../model";
import { type InternalNetworkMessage, type ToolMessage } from "../state";

/**
 * Parse a request from internal network messages to an OpenAI input.
 */
export const requestParser: AgenticModel.RequestParser<OpenAi.AiModel> = ({
  model,
  messages,
  tools,
}) => {
  const body: AiAdapter.Input<OpenAi.AiModel> = {
    messages: messages.map((m) => {
      return {
        role: m.role,
        content: m.content,
      };
    }) as AiAdapter.Input<OpenAi.AiModel>["messages"],
  };

  if (tools?.length) {
    body.tools = tools.map((t) => {
      return {
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: zodToJsonSchema(t.parameters),
          strict: true,
        },
      };
    });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${model.authKey}`,
  };

  return { body, headers };
};

/**
 * Parse a response from OpenAI output to internal network messages.
 */
export const responseParser: AgenticModel.ResponseParser<OpenAi.AiModel> = ({
  output,
}) => {
  return (output?.choices ?? []).reduce<InternalNetworkMessage[]>(
    (acc, choice) => {
      if (!choice.message) {
        return acc;
      }

      return [
        ...acc,
        {
          role: choice.message.role,
          content: choice.message.content,
          tools: (choice.message.tool_calls ?? []).map<ToolMessage>((tool) => {
            return {
              type: "tool",
              id: tool.id,
              name: tool.function.name,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              input: JSON.parse(tool.function.arguments || "{}"),
            };
          }),
        } as InternalNetworkMessage,
      ];
    },
    [],
  );
};
