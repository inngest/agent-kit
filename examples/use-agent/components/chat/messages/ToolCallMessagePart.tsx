
import type { ToolCallUIPart } from "@/hooks/use-agent";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface ToolCallMessagePartProps {
  part: ToolCallUIPart;
}

export function ToolCallMessagePart({ part }: ToolCallMessagePartProps) {
  const getToolCallIcon = () => {
    switch (part.state) {
      case "input-streaming":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "input-available":
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      case "awaiting-approval":
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case "executing":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "output-available":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  const getToolCallColor = () => {
    switch (part.state) {
      case "input-streaming":
      case "executing":
        return "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300";
      case "input-available":
        return "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300";
      case "awaiting-approval":
        return "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300";
      case "output-available":
        return "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300";
      default:
        return "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300";
    }
  };

  return (
    <div className={`mt-2 p-3 rounded-lg ${getToolCallColor()}`}>
      <div className="flex items-center gap-2 text-sm">
        {getToolCallIcon()}
        <span className="font-medium">
          {part.state === "input-streaming"
            ? "Preparing"
            : part.state === "executing"
            ? "Executing"
            : part.state === "output-available"
            ? "Completed"
            : "Called"}{" "}
          {part.toolName}
        </span>
      </div>

      {part.input && Object.keys(part.input).length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-medium mb-1">Input:</div>
          <pre className="text-xs overflow-x-auto bg-black/5 dark:bg-white/5 rounded p-2">
            {JSON.stringify(part.input, null, 2)}
          </pre>
        </div>
      )}

      {part.output && (
        <div className="mt-2">
          <div className="text-xs font-medium mb-1">Output:</div>
          <pre className="text-xs overflow-x-auto bg-black/5 dark:bg-white/5 rounded p-2">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        </div>
      )}

      {part.error && (
        <div className="mt-2">
          <div className="text-xs font-medium mb-1 text-red-600">Error:</div>
          <div className="text-xs text-red-600">{part.error}</div>
        </div>
      )}
    </div>
  );
}
