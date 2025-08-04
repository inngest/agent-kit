
import { ConversationMessage } from "@/hooks/use-agent";
import { Message } from "./Message";
import { TypingIndicator } from "./TypingIndicator";

interface MessageListProps {
  messages: ConversationMessage[];
  status: 'thinking' | 'responding' | 'idle' | 'error' | 'calling-tool';
}

export function MessageList({ messages, status }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, i) => (
        <Message key={i} message={message} />
      ))}
      {(status === "thinking" || status === "responding") && <TypingIndicator />}
    </div>
  );
}
