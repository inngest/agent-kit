
import type { SourceUIPart } from "@inngest/use-agents";
import { ExternalLink } from "lucide-react";

interface SourceMessagePartProps {
  part: SourceUIPart;
  key: number;
}

export function SourceMessagePart({ part, key }: SourceMessagePartProps) {
  return (
    <div key={key} className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
      <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300 mb-2">
        <ExternalLink className="h-4 w-4" />
        <span className="font-medium">Source: {part.title}</span>
      </div>
      {part.excerpt && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 italic">
          "{part.excerpt}"
        </p>
      )}
      {part.url && (
        <a
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          View Source
        </a>
      )}
    </div>
  );
}
