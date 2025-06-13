import { useState, useRef, useEffect } from "react";
import { Message, TextMessage } from "@inngest/agent-kit";

export interface UseChatStreamOptions {
  endpoint?: string;
  userId?: string;
}

export interface UseChatStreamReturn {
  // State
  messages: Message[];
  agentResults: any[];
  isLoading: boolean;
  threadId: string | null;
  totalMessages: number;
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
  const [agentResults, setAgentResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [totalMessages, setTotalMessages] = useState(0);
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

      // Convert database history to UI messages and agent results
      const uiMessages: Message[] = [];
      const threadAgentResults: any[] = [];

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

          // Create AgentResult for user message
          threadAgentResults.push({
            agentName: "user",
            output: [userMessage],
            toolCalls: [],
            createdAt: item.createdAt,
            checksum: `user_${new Date(item.createdAt).getTime()}`,
          });
        } else if (item.type === "agent" && item.data) {
          // Agent message - reconstruct from stored data
          const agentData = item.data;
          if (agentData.output && agentData.output.length > 0) {
            uiMessages.push(...agentData.output);
          }

          // Add the full AgentResult
          threadAgentResults.push({
            agentName: agentData.agentName,
            output: agentData.output,
            toolCalls: agentData.toolCalls || [],
            createdAt: agentData.createdAt,
            checksum: agentData.checksum,
          });
        }
      }

      // Update state with loaded conversation
      setMessages(uiMessages);
      setAgentResults(threadAgentResults);
      setThreadId(selectedThreadId);
      setTotalMessages(data.messageCount);

      console.log(
        `📚 Loaded thread ${selectedThreadId} with ${uiMessages.length} UI messages and ${threadAgentResults.length} agent results`
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

    const userMessage: TextMessage = {
      type: "text",
      role: "user",
      content,
      stop_reason: "stop",
    };
    setMessages((prev) => [...prev, userMessage]);

    const userAgentResult = {
      agentName: "user",
      output: [userMessage],
      toolCalls: [],
      createdAt: new Date().toISOString(),
      checksum: `user_${Date.now()}_${Math.random()}`,
    };

    const updatedAgentResults = [...agentResults, userAgentResult];
    setAgentResults(updatedAgentResults);
    setIsLoading(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: content,
          threadId,
          userId,
          agentResults: updatedAgentResults,
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

              const assistantAgentResult = {
                agentName: "simple_agent",
                output: [assistantMessage],
                toolCalls: [],
                createdAt: new Date().toISOString(),
                checksum: `assistant_${Date.now()}_${Math.random()}`,
              };

              setAgentResults((prev) => [...prev, assistantAgentResult]);
            } else if (event.data?.status === "complete") {
              setIsLoading(false);
              cleanupCurrentStream();

              if (event.data.threadId) {
                setThreadId(event.data.threadId);
              }

              if (event.data.newResults) {
                const nonAssistantResults = event.data.newResults.filter(
                  (result: any) => result.agentName !== "simple_agent"
                );

                if (nonAssistantResults.length > 0) {
                  setAgentResults((prev) => [...prev, ...nonAssistantResults]);
                }
              }

              if (event.data.totalMessages) {
                setTotalMessages(event.data.totalMessages);
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
    setAgentResults([]);
    setThreadId(null);
    setTotalMessages(0);
  };

  return {
    // State
    messages,
    agentResults,
    isLoading,
    threadId,
    totalMessages,
    isLoadingThread,

    // Actions
    sendMessage,
    loadThread,
    startNewChat,
  };
}
