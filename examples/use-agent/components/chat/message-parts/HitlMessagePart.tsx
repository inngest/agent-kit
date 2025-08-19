
import type { HitlUIPart } from "@/hooks/use-agent";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Shield,
} from "lucide-react";

interface HitlMessagePartProps {
  part: HitlUIPart;
  key: number;
}

export function HitlMessagePart({ part, key }: HitlMessagePartProps) {
  const getHitlIcon = () => {
    switch (part.status) {
      case "pending":
        return <Clock className="h-4 w-4 text-orange-600" />;
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "denied":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "expired":
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getHitlColor = () => {
    switch (part.status) {
      case "pending":
        return "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200";
      case "approved":
        return "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200";
      case "denied":
        return "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200";
      case "expired":
        return "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200";
      default:
        return "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200";
    }
  };

  return (
    <div key={key} className={`mt-2 p-3 rounded-lg border ${getHitlColor()}`}>
      <div className="flex items-center gap-2 text-sm mb-2">
        {getHitlIcon()}
        <span className="font-medium">
          Human Approval {part.status === "pending" ? "Required" : part.status}
        </span>
        {part.metadata?.riskLevel && (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              part.metadata.riskLevel === "high"
                ? "bg-red-100 text-red-700"
                : part.metadata.riskLevel === "medium"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {part.metadata.riskLevel} risk
          </span>
        )}
      </div>

      {part.metadata?.reason && (
        <p className="text-sm mb-2 italic">{part.metadata.reason}</p>
      )}

      <div className="space-y-2">
        {part.toolCalls.map((tool: { toolName: string; toolInput: any; }, toolIndex: number) => (
          <div
            key={toolIndex}
            className="bg-black/5 dark:bg-white/5 rounded p-2"
          >
            <div className="font-medium text-sm">{tool.toolName}</div>
            <pre className="text-xs mt-1 overflow-x-auto">
              {JSON.stringify(tool.toolInput, null, 2)}
            </pre>
          </div>
        ))}
      </div>

      {part.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <button className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-3 rounded flex items-center justify-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Approve
          </button>
          <button className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-3 rounded flex items-center justify-center gap-1">
            <XCircle className="h-3 w-3" />
            Deny
          </button>
        </div>
      )}

      {part.resolvedBy && (
        <div className="mt-2 text-xs text-gray-500">
          {part.status} by {part.resolvedBy}{" "}
          {part.resolvedAt &&
            `at ${new Date(part.resolvedAt).toLocaleString()}`}
        </div>
      )}

      {part.expiresAt && part.status === "pending" && (
        <div className="mt-2 text-xs text-gray-500">
          Expires: {new Date(part.expiresAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
