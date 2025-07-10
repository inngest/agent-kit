import { useState, useRef, useEffect } from "react";
import { Message, TextMessage } from "@inngest/agent-kit";

export interface UseChatStreamOptions {
  endpoint?: string;
  userId?: string;
}

export interface UseChatStreamReturn {
  // State
  messages: Message[];
  isLoading: boolean;
  threadId: string | null;
  isLoadingThread: boolean;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  loadThread: (threadId: string) => Promise<void>;
  startNewChat: () => void;
}

export function useChatStream({
  endpoint = "/api/chat",
  userId = "test-user-123",
}: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const currentStreamController = useRef<AbortController | null>(null);

  // Cleanup function for the current stream
  const cleanupCurrentStream = () => {
    if (currentStreamController.current) {
      currentStreamController.current.abort();
      currentStreamController.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCurrentStream();
    };
  }, []);

  // Load thread history from database
  const loadThread = async (selectedThreadId: string) => {
    try {
      setIsLoadingThread(true);
      const response = await fetch(`/api/threads/${selectedThreadId}/history`);

      if (!response.ok) {
        throw new Error("Failed to load thread history");
      }

      const data = await response.json();

      // Convert database history to simple UI messages
      const uiMessages: Message[] = [];

      for (const item of data.history) {
        if (item.type === "user") {
          // User message
          const userMessage: TextMessage = {
            type: "text",
            role: "user",
            content: item.content,
            stop_reason: "stop",
          };
          uiMessages.push(userMessage);
        } else if (item.type === "agent" && item.data) {
          // Agent message - extract messages from stored AgentResult
          const agentData = item.data;
          if (agentData.output && agentData.output.length > 0) {
            uiMessages.push(...agentData.output);
          }
        }
      }

      // Update state with loaded conversation
      setMessages(uiMessages);
      setThreadId(selectedThreadId);

      console.log(
        `📚 Loaded thread ${selectedThreadId} with ${uiMessages.length} UI messages`
      );
    } catch (error) {
      console.error("Failed to load thread history:", error);
      throw error; // Re-throw so caller can handle if needed
    } finally {
      setIsLoadingThread(false);
    }
  };

  // Send a message and handle streaming response
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    cleanupCurrentStream();
    currentStreamController.current = new AbortController();

    // Generate unique streamId for this request
    const streamId = crypto.randomUUID();
    console.log(`🆔 Generated streamId: ${streamId}`);

    // Create simple user message (no fake AgentResult needed)
    const userMessage: TextMessage = {
      type: "text",
      role: "user",
      content,
      stop_reason: "stop",
    };
    
    // Create updated messages array that includes the new user message
    const updatedMessages = [...messages, userMessage];
    
    // Add user message to UI immediately
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: content,
          threadId, // For persistence (may be null for new conversations)
          userId,
          messages: updatedMessages, // Send the updated messages including the new user message
          streamId, // Single channel for real-time communication
        }),
        signal: currentStreamController.current.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const newText = decoder.decode(value, { stream: true });
        buffer += newText;

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);

            if (event.data?.message) {
              const assistantMessage = event.data.message as TextMessage;
              setMessages((prev) => [...prev, assistantMessage]);
            } else if (event.data?.status === "complete") {
              setIsLoading(false);
              cleanupCurrentStream();

              if (event.data.threadId) {
                setThreadId(event.data.threadId);
              }

            }
          } catch (e) {
            console.error("Error parsing event:", e);
          }
        }
      }
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        return;
      }

      console.error("Error:", error);
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          type: "text",
          role: "assistant",
          content: "Sorry, there was an error processing your request.",
          stop_reason: "stop",
        } as TextMessage,
      ]);
      throw error; // Re-throw so caller can handle if needed
    }
  };

  // Start a new chat session
  const startNewChat = () => {
    cleanupCurrentStream();
    setMessages([]);
    setThreadId(null);
  };

  return {
    // State
    messages,
    isLoading,
    threadId,
    isLoadingThread,

    // Actions
    sendMessage,
    loadThread,
    startNewChat,
  };
}
