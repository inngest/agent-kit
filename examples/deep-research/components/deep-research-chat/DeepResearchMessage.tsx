"use client";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { User, Bot } from "lucide-react";
import { useEffect, useState } from "react";

interface DeepResearchMessageProps {
  role: "user" | "assistant";
  content: string;
}

// Component for client-side markdown rendering
function ClientMarkdown({ content }: { content: string }) {
  const [MarkdownComponent, setMarkdownComponent] = useState<React.ComponentType<any> | null>(null);
  
  useEffect(() => {
    // Dynamically import markdown components only on client
    async function loadMarkdown() {
      try {
        const [
          ReactMarkdown, 
          remarkGfm, 
          rehypeRaw, 
          rehypeHighlight
        ] = await Promise.all([
          import('react-markdown').then(mod => mod.default),
          import('remark-gfm').then(mod => mod.default),
          import('rehype-raw').then(mod => mod.default),
          import('rehype-highlight').then(mod => mod.default)
        ]);
        
        // Create a component with all plugins configured
        const CustomMarkdown = (props: { children: string }) => (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeHighlight]}
            components={{
              code: (codeProps: any) => {
                const { children, className, inline } = codeProps;
                if (inline) {
                  return <code className="inline-code">{children}</code>;
                }
                return (
                  <pre className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded-lg overflow-x-auto">
                    <code className={className}>{children}</code>
                  </pre>
                );
              }
            }}
          >
            {props.children}
          </ReactMarkdown>
        );
        
        setMarkdownComponent(() => CustomMarkdown);
      } catch (error) {
        console.error("Error loading markdown components:", error);
      }
    }
    
    loadMarkdown();
  }, []);
  
  if (!MarkdownComponent) {
    // Fallback until markdown is loaded
    return (
      <>
        {content.split('\n\n').map((paragraph, i) => (
          <p key={i} className="mb-4">{paragraph}</p>
        ))}
      </>
    );
  }
  
  return <MarkdownComponent>{content}</MarkdownComponent>;
}

export function DeepResearchMessage({ role, content }: DeepResearchMessageProps) {
  const isUser = role === "user";
  const [isClient, setIsClient] = useState(false);
  
  // Only enable client-side features after hydration
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser ? (
        <div className="bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white p-3 rounded-xl max-w-3xl border border-zinc-300 dark:border-zinc-600">
          <p>{content}</p>
        </div>
      ) : (
        <div className="max-w-3xl dark:text-white">
          <div className="prose dark:prose-invert prose-sm max-w-none">
            {isClient ? (
              <ClientMarkdown content={content} />
            ) : (
              // Server-side or initial client render
              content.split('\n\n').map((paragraph, i) => (
                <p key={i} className="mb-4">{paragraph}</p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
} 