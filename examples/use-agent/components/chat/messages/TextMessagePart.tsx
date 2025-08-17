
import type { TextUIPart } from "@/hooks/use-agent";
import { Response } from '@/components/ai-elements/response';

interface TextMessagePartProps {
  part: TextUIPart;
}

export function TextMessagePart({ part }: TextMessagePartProps) {
  return (
    <Response className="w-full">
      {part.content}
    </Response>
  );
}
