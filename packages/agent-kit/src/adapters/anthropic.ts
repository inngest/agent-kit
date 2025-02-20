/**
 * Adapters for Anthropic I/O to transform to/from internal network messages.
 *
 * @module
 */
import {
  type AiAdapter,
  type Anthropic,
  type AnthropicAiAdapter,
} from "@inngest/ai";
import { zodToJsonSchema } from "openai-zod-to-json-schema";
import { z } from "zod";
import { type AgenticModel } from "../model";
import { type Message, type TextMessage } from "../state";
import { type Tool } from "../tool";

/**
 * Parse a request from internal network messages to an Anthropic input.
 */
export const requestParser: AgenticModel.RequestParser<Anthropic.AiModel> = (
  model,
  messages,
  tools,
  tool_choice = "auto"
) => {
  // Note that Anthropic has a top-level system prompt, then a series of prompts
  // for assistants and users.
  const systemMessage = messages.find(
    (m) => m.role === "system" && m.type === "text"
  ) as TextMessage;
  const system =
    typeof systemMessage?.content === "string" ? systemMessage.content : "";

  const anthropicMessages: AiAdapter.Input<Anthropic.AiModel>["messages"] =
    messages
      .filter((m) => m.role !== "system")
      .reduce(
        (acc, m) => {
          switch (m.type) {
            case "text":
              return [
                ...acc,
                {
                  role: m.role,
                  content: Array.isArray(m.content)
                    ? m.content.map((text) => ({ type: "text", text }))
                    : m.content,
                },
              ] as AiAdapter.Input<Anthropic.AiModel>["messages"];
            case "tool_call":
              return [
                ...acc,
                {
                  role: m.role,
                  content: m.tools.map((tool) => ({
                    type: "tool_use",
                    id: tool.id,
                    input: tool.input,
                    name: tool.name,
                  })),
                },
              ];
            case "tool_result":
              return [
                ...acc,
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: m.tool.id,
                      content:
                        typeof m.content === "string"
                          ? m.content
                          : JSON.stringify(m.content),
                    },
                  ],
                },
              ];
          }
        },
        [] as AiAdapter.Input<Anthropic.AiModel>["messages"]
      );

  // We need to patch the last message if it's an assistant message.  This is a known limitation of Anthropic's API.
  // cf: https://github.com/langchain-ai/langgraph/discussions/952#discussioncomment-10012320
  const lastMessage = anthropicMessages[anthropicMessages.length - 1];
  if (lastMessage?.role === "assistant") {
    lastMessage.role = "user";
  }

  const request: AiAdapter.Input<Anthropic.AiModel> = {
    system,
    model: model.options.model,
    max_tokens: model.options.max_tokens,
    messages: anthropicMessages,
  };

  if (tools?.length) {
    request.tools = tools.map((t) => {
      return {
        name: t.name,
        description: t.description,
        input_schema: (t.parameters
          ? zodToJsonSchema(t.parameters)
          : zodToJsonSchema(
              z.object({})
            )) as AnthropicAiAdapter.Tool.InputSchema,
      };
    });
    request.tool_choice = toolChoice(tool_choice);
  }

  return request;
};

/**
 * Parse a response from Anthropic output to internal network messages.
 */
export const responseParser: AgenticModel.ResponseParser<Anthropic.AiModel> = (
  input
) => {
  if (input.type === "error") {
    throw new Error(
      input.error?.message ||
        `Anthropic request failed: ${JSON.stringify(input.error)}`
    );
  }

  return (input?.content ?? []).reduce<Message[]>((acc, item) => {
    if (!item.type) {
      return acc;
    }

    switch (item.type) {
      case "text":
        return [
          ...acc,
          {
            type: "text",
            role: input.role,
            content: item.text,
            // XXX: Better stop reason parsing
            stop_reason: "stop",
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
            type: "tool_call",
            role: input.role,
            stop_reason: "tool",
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
  }, []);
};

const toolChoice = (
  choice: Tool.Choice
): AiAdapter.Input<Anthropic.AiModel>["tool_choice"] => {
  switch (choice) {
    case "auto":
      return { type: "auto" };
    case "any":
      return { type: "any" };
    default:
      if (typeof choice === "string") {
        return {
          type: "tool",
          name: choice as string,
        };
      }
  }
};
