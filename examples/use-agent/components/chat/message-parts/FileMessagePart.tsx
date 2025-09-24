
import type { FileUIPart } from "@inngest/use-agent";
import {
  Image,
  FileText,
  File,
  Download,
} from "lucide-react";

interface FileMessagePartProps {
  part: FileUIPart;
  key: number;
}

export function FileMessagePart({ part, key }: FileMessagePartProps) {
  const getFileIcon = () => {
    if (part.mediaType.startsWith("image/"))
      return <Image className="h-4 w-4" />;
    if (part.mediaType.includes("text") || part.mediaType.includes("document"))
      return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  return (
    <div key={key} className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center gap-2 text-sm">
        {getFileIcon()}
        <span className="font-medium">{part.title || "File"}</span>
        {part.size && (
          <span className="text-xs text-gray-500">
            ({(part.size / 1024).toFixed(1)} KB)
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <a
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
        >
          <Download className="h-3 w-3" />
          Download
        </a>
        <span className="text-xs text-gray-500">{part.mediaType}</span>
      </div>
    </div>
  );
}
