import type { ThreadMessageLike } from "@assistant-ui/react";
import type { ConversationMessage, MessagePart } from "@inngest/use-agent";

type Part = Exclude<ThreadMessageLike["content"], string>[number];

export function convertMessage(
  message: ConversationMessage
): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    createdAt: message.timestamp,
    content: message.parts.flatMap(convertPart),
  };
}

function convertPart(part: MessagePart): Part[] {
  switch (part.type) {
    case "text":
      return [{ type: "text", text: part.content }];
    case "reasoning":
      return [{ type: "reasoning", text: part.content }];
    case "tool-call": {
      const done = part.state === "output-available";
      // While AgentKit streams the arguments, input is a partial JSON string.
      const argsText =
        typeof part.input === "string"
          ? part.input
          : JSON.stringify(part.input ?? {});
      return [
        {
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          argsText,
          // AgentKit wraps tool return values as { data }.
          ...(done ? { result: (part.output as { data?: unknown }).data } : {}),
        },
      ];
    }
    // AgentKit does not emit these today.
    case "data":
    case "file":
    case "source":
    case "status":
    case "error":
    case "hitl":
      return [];
  }
}
