
import { Bot, User } from "lucide-react";
import { ConversationMessage } from "@/hooks/use-agent";
import { MessagePart } from "./MessagePart";

interface MessageProps {
  message: ConversationMessage;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-3 max-w-[80%] ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-500' : 'bg-gray-500'}`}>
          {isUser ? <User className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
        </div>
        <div className={`rounded-lg p-4 ${isUser ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
          {message.parts.map((part, index) => (
            <MessagePart key={index} part={part} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
