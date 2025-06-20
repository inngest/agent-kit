"use client";

import { Message, TextMessage } from "@inngest/agent-kit";
import { Avatar } from "@/components/ui/avatar";
import { User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

export function ChatMessage({ message }: { message: Message }) {
  if (message.type !== "text") return null;
  const textMessage = message as TextMessage;
  const isUser = textMessage.role === "user";

  const components: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const isInline = !match;
      return isInline ? (
        <code {...props} className="bg-zinc-800 rounded px-1 py-0.5 text-sm">
          {children}
        </code>
      ) : (
        <pre className="bg-zinc-950 rounded-lg p-4 overflow-x-auto">
          <code {...props} className={cn("text-sm", className)}>
            {String(children).replace(/\n$/, "")}
          </code>
        </pre>
      );
    }
  };

  return (
    <div className={cn("flex items-start gap-4 px-4", isUser && "flex-row-reverse")}>
      <Avatar className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full border",
        isUser 
          ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" 
          : "bg-violet-500/10 border-violet-500/20"
      )}>
        {isUser ? (
          <User className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
        ) : (
          <Bot className="h-5 w-5 text-violet-500" />
        )}
      </Avatar>
      
      <div className={cn(
        "flex-1 space-y-2 overflow-hidden",
        isUser && "items-end"
      )}>
        <div className={cn(
          "rounded-xl px-4 py-2 max-w-prose",
          isUser 
            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300" 
            : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
        )}>
          {typeof textMessage.content === "string" ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={components}
            >
              {textMessage.content}
            </ReactMarkdown>
          ) : (
            <div>{JSON.stringify(textMessage.content)}</div>
          )}
        </div>
      </div>
    </div>
  );
} 