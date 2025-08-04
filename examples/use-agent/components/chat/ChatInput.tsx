
import { Send } from "lucide-react";

interface ChatInputProps {
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isConnected: boolean;
  status: 'thinking' | 'responding' | 'idle' | 'error' | 'calling-tool';
}

export function ChatInput({ inputValue, onInputChange, handleSubmit, isConnected, status }: ChatInputProps) {
  return (
    <form onSubmit={handleSubmit} className="p-4 border-t">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={onInputChange}
          placeholder="Type your message..."
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={!isConnected || status !== "idle"}
        />
        <button
          type="submit"
          disabled={!isConnected || status !== "idle" || !inputValue.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Send className="h-4 w-4" />
          Send
        </button>
      </div>
    </form>
  );
}
