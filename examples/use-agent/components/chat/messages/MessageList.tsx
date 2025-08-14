
import { ConversationMessage } from "@/hooks/use-agent";
import { Message } from "./Message";
import { TypingIndicator } from "./TypingIndicator";

interface MessageListProps {
  messages: ConversationMessage[];
  status: 'thinking' | 'responding' | 'idle' | 'error' | 'calling-tool';
  onApprove?: (toolCallId: string) => void;
  onDeny?: (toolCallId: string, reason?: string) => void;
}

export function MessageList({ messages, status, onApprove, onDeny }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, i) => (
        <Message key={i} message={message} onApprove={onApprove} onDeny={onDeny} />
      ))}
      {(status === "thinking" || status === "responding") && <TypingIndicator />}
    </div>
  );
}
