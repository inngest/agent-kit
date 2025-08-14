
"use client";

import { useState } from "react";
import { v4 as uuidv4 } from 'uuid';
import { useAgent } from "@/hooks/use-agent";
import { MessageList } from "./messages/MessageList";
import { ChatInput } from "./ChatInput";
import { ConnectionStatus } from "./ConnectionStatus";

interface ChatProps {
  threadId?: string;
}

export function Chat({ threadId: providedThreadId }: ChatProps) {
  const [threadId] = useState(providedThreadId || uuidv4());
  const [inputValue, setInputValue] = useState("I need a refund");

  const { 
    messages, 
    status, 
    sendMessage, 
    isConnected, 
    currentAgent, 
    error, 
    clearError 
  } = useAgent({
    threadId,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || status !== "idle") return;

    sendMessage(inputValue);
    setInputValue("");
  };

  const handleApprove = async (toolCallId: string) => {
    try {
      const response = await fetch("/api/approve-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          toolCallId, 
          threadId, 
          action: "approve" 
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to approve tool call");
      }
      
      console.log(`[Chat] Tool ${toolCallId} approved`);
    } catch (error) {
      console.error("[Chat] Error approving tool:", error);
      // Could show an error toast here
    }
  };

  const handleDeny = async (toolCallId: string, reason?: string) => {
    try {
      const response = await fetch("/api/approve-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          toolCallId, 
          threadId, 
          action: "deny",
          reason 
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to deny tool call");
      }
      
      console.log(`[Chat] Tool ${toolCallId} denied`, reason ? `with reason: ${reason}` : '');
    } catch (error) {
      console.error("[Chat] Error denying tool:", error);
      // Could show an error toast here
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ConnectionStatus isConnected={isConnected} currentAgent={currentAgent} />
      
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  {error.message}
                  {error.recoverable && (
                    <span className="ml-2 text-xs text-red-600">
                      (You can try sending your message again)
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex-shrink-0">
              <button
                onClick={clearError}
                className="bg-red-50 rounded-md p-1.5 text-red-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      
      <MessageList 
        messages={messages} 
        status={status} 
        onApprove={handleApprove}
        onDeny={handleDeny}
      />
      <ChatInput
        inputValue={inputValue}
        onInputChange={(e) => setInputValue(e.target.value)}
        handleSubmit={handleSubmit}
        isConnected={isConnected}
        status={status}
      />
    </div>
  );
}
