
import type { StatusUIPart } from "@/hooks/use-agent";
import {
  Zap,
  Brain,
  Loader2,
  CheckCircle,
  XCircle,
  Info,
  Clock,
} from "lucide-react";

interface StatusMessagePartProps {
  part: StatusUIPart;
  key: number;
}

export function StatusMessagePart({ part, key }: StatusMessagePartProps) {
  const getStatusIcon = () => {
    switch (part.status) {
      case "started":
        return <Zap className="h-4 w-4 text-green-600" />;
      case "thinking":
        return <Brain className="h-4 w-4 text-blue-600" />;
      case "calling-tool":
        return <Loader2 className="h-4 w-4 animate-spin text-purple-600" />;
      case "responding":
        return <Loader2 className="h-4 w-4 animate-spin text-green-600" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  return (
    <div key={key} className="mt-1 flex items-center gap-2 text-xs text-gray-500">
      {getStatusIcon()}
      <span>
        {part.agentId && `${part.agentId}: `}
        {part.message || part.status}
      </span>
      <Clock className="h-3 w-3 ml-auto" />
    </div>
  );
}
