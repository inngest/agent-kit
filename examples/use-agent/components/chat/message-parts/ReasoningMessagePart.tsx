
import type { ReasoningUIPart } from "@inngest/use-agents";
import { Brain, Loader2 } from "lucide-react";

interface ReasoningMessagePartProps {
  part: ReasoningUIPart;
  key: number;
}

export function ReasoningMessagePart({ part, key }: ReasoningMessagePartProps) {
  return (
    <details key={key} className="mt-2">
      <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 hover:text-gray-800 dark:hover:text-gray-200">
        <Brain className="h-4 w-4" />
        View {part.agentName} reasoning
        {part.status === "streaming" && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
      </summary>
      <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-sm font-mono">{part.content}</p>
        {part.status === "streaming" && (
          <span className="animate-pulse">▊</span>
        )}
      </div>
    </details>
  );
}
