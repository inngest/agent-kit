"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatHeader } from "./ChatHeader";
import { ChatUpdate } from "./types";
import { Message, TextMessage } from "@inngest/agent-kit";
import { ArrowUp, Loader2 } from "lucide-react";

// Helper function to generate a random ID
const generateThreadId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentResults, setAgentResults] = useState<any[]>([]); // Store AgentResult objects
  const [isLoading, setIsLoading] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [threadId] = useState(() => generateThreadId()); // Initialize threadId on mount
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentStreamController = useRef<AbortController | null>(null);

  // Cleanup function for the current stream
  const cleanupCurrentStream = () => {
    if (currentStreamController.current) {
      currentStreamController.current.abort();
      currentStreamController.current = null;
    }
  };

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCurrentStream();
    };
  }, []);

  // Resize textarea as content grows
  const resizeTextarea = () => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        handleSubmit(new Event('submit') as any);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    // Cleanup any existing stream before starting a new one
    cleanupCurrentStream();

    // Create a new abort controller for this stream
    currentStreamController.current = new AbortController();

    // Add user message immediately to UI
    const userMessage: TextMessage = {
      type: "text",
      role: "user",
      content: userInput,
      stop_reason: "stop"
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Create a user AgentResult for conversation history
    const userAgentResult = {
      agentName: "user", // Distinguish user messages
      output: [userMessage],
      toolCalls: [],
      createdAt: new Date().toISOString(),
      checksum: `user_${Date.now()}_${Math.random()}`, // Simple unique ID for user messages
    };

    // Add user message to agentResults immediately
    const updatedAgentResults = [...agentResults, userAgentResult];
    setAgentResults(updatedAgentResults);

    setIsLoading(true);
    setUserInput("");
    resizeTextarea();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ 
          query: userInput,
          threadId,
          agentResults: updatedAgentResults, // Send updated AgentResult objects including new user message
        }),
        signal: currentStreamController.current.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the chunk and add to buffer
        const newText = decoder.decode(value, { stream: true });
        buffer += newText;

        // Process complete messages from buffer
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);

            if (event.data?.message) {
              setMessages(prev => [...prev, event.data.message as TextMessage]);
            } else if (event.data?.status === "complete") {
              setIsLoading(false);
              // Clean up this stream since it's complete
              cleanupCurrentStream();
              
              // Append new agentResults to existing conversation history
              if (event.data.agentResults) {
                setAgentResults(prev => [...prev, ...event.data.agentResults]);
              }
            }
          } catch (e) {
            console.error('Error parsing event:', e);
          }
        }
      }
    } catch (error: unknown) {
      // Only show error if it's not from an aborted request
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        // Ignore abort errors
        return;
      }
      
      console.error('Error:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        type: "text",
        role: "assistant",
        content: "Sorry, there was an error processing your request.",
        stop_reason: "stop"
      } as TextMessage]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      <ChatHeader
        onNewChat={() => {
          cleanupCurrentStream();
          setMessages([]);
          setAgentResults([]);
        }}
        onShareChat={() => {}}
        onViewConversations={() => {}}
        onViewProfile={() => {}}
      />
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 px-4 sm:px-8 md:px-12 lg:px-20 xl:px-[20%]"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-start h-full ml-4 xl:justify-center xl:ml-0">
            <div className="text-left xl:text-center">
              <h2 className="text-2xl font-semibold mb-1 dark:text-white">Chat 💬</h2>
              <p className="text-xl text-gray-500 dark:text-zinc-400 mb-4">
                How can I help you today?
              </p>
            </div>
          </div>
        ) : (
          messages.map((message, i) => (
            <ChatMessage key={i} message={message} />
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t dark:border-zinc-800">
        <div className="flex items-end space-x-2">
          <div className="flex-grow relative bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <textarea 
              ref={inputRef}
              className="w-full px-3 py-2 bg-transparent border-none focus:ring-0 focus:outline-none text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 resize-none min-h-[24px] max-h-[200px]"
              placeholder="Type a message..."
              value={userInput}
              onChange={(e) => {
                setUserInput(e.target.value);
                resizeTextarea();
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />
          </div>

          {/* Submit button */}
          <button 
            type="submit"
            className="p-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
            disabled={!userInput.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
} 