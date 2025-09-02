
import type { DataUIPart } from "@inngest/use-agents";
import { Zap } from "lucide-react";

interface DataMessagePartProps {
  part: DataUIPart;
  key: number;
}

export function DataMessagePart({ part, key }: DataMessagePartProps) {
  return (
    <div key={key} className="mt-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
      <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300 mb-2">
        <Zap className="h-4 w-4" />
        <span className="font-medium">
          Generated Data: {part.name}
        </span>
      </div>
      {part.ui ? (
        part.ui
      ) : (
        <pre className="text-xs overflow-x-auto bg-black/5 dark:bg-white/5 rounded p-2">
          {JSON.stringify(part.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
