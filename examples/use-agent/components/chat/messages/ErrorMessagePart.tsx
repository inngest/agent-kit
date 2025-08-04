
import type { ErrorUIPart } from "@/hooks/use-agent";
import { XCircle } from "lucide-react";

interface ErrorMessagePartProps {
  part: ErrorUIPart;
}

export function ErrorMessagePart({ part }: ErrorMessagePartProps) {
  return (
    <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-500">
      <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-2">
        <XCircle className="h-4 w-4" />
        <span className="font-medium">Error</span>
        {part.agentId && (
          <span className="text-sm">({part.agentId})</span>
        )}
      </div>
      <p className="text-sm text-red-600 dark:text-red-400">
        {part.error}
      </p>
      {part.recoverable && (
        <div className="mt-2">
          <button className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
