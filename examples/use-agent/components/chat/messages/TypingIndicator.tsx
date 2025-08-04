
import { Bot } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center">
        <Bot className="h-5 w-5 text-white" />
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
        <div className="flex gap-1">
          <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
