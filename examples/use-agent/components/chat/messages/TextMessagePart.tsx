
import type { TextUIPart } from "@/hooks/use-agent";

interface TextMessagePartProps {
  part: TextUIPart;
}

export function TextMessagePart({ part }: TextMessagePartProps) {
  return (
    <div className="relative w-full whitespace-pre-wrap pr-4">
      {part.content}
    </div>
  );
}
