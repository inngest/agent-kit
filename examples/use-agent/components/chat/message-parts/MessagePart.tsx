
import { MessagePart as MessagePartType } from "@inngest/use-agent";
import { TextMessagePart } from "./TextMessagePart";
import { ToolCallMessagePart } from "./ToolCallMessagePart";
import { DataMessagePart } from "./DataMessagePart";
import { FileMessagePart } from "./FileMessagePart";
import { SourceMessagePart } from "./SourceMessagePart";
import { ReasoningMessagePart } from "./ReasoningMessagePart";
import { StatusMessagePart } from "./StatusMessagePart";
import { ErrorMessagePart } from "./ErrorMessagePart";
import { HitlMessagePart } from "./HitlMessagePart";
import { UnsupportedMessagePart } from "./UnsupportedMessagePart";

interface MessagePartProps {
  part: MessagePartType;
  index: number;
  onApprove?: (toolCallId: string) => void;
  onDeny?: (toolCallId: string, reason?: string) => void;
}

export function MessagePart({ part, index, onApprove, onDeny }: MessagePartProps) {
  switch (part.type) {
    case "text":
      return <TextMessagePart key={index} part={part} />;
    case "tool-call":
      return <ToolCallMessagePart key={index} part={part} onApprove={onApprove} onDeny={onDeny} />;
    case "data":
      return <DataMessagePart key={index} part={part} />;
    case "file":
      return <FileMessagePart key={index} part={part} />;
    case "source":
      return <SourceMessagePart key={index} part={part} />;
    case "reasoning":
      return <ReasoningMessagePart key={index} part={part} />;
    case "status":
      return <StatusMessagePart key={index} part={part} />;
    case "error":
      return <ErrorMessagePart key={index} part={part} />;
    case "hitl":
      return <HitlMessagePart key={index} part={part} />;
    default:
      return <UnsupportedMessagePart key={index} part={part} />;
  }
}
