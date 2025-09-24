
import { MessagePart } from "@inngest/use-agent";

interface UnsupportedMessagePartProps {
  part: MessagePart;
  key: number;
}

export function UnsupportedMessagePart({ part, key }: UnsupportedMessagePartProps) {
  return (
    <div key={key} className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600">
      Unsupported part type: {(part as any).type}
    </div>
  );
}
