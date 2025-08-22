import { useState, useEffect, useCallback } from 'react';
import type { Thread } from './use-threads';

export interface ThreadMessage {
  type: 'user' | 'agent';
  agentName?: string;
  content?: string; // For user messages
  data?: any; // For agent results
  createdAt: Date;
}

export interface UseThreadLoaderReturn {
  thread: Thread | null;
  messages: ThreadMessage[];
  loading: boolean;
  error: string | null;
  loadThread: (threadId: string) => Promise<void>;
  clearThread: () => void;
}

export function useThreadLoader(): UseThreadLoaderReturn {
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThread = useCallback(async (threadId: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/threads/${threadId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Thread not found');
        }
        throw new Error('Failed to load thread');
      }

      const data = await response.json();
      
      setThread(data.thread);
      setMessages(data.messages.map((msg: any) => ({
        ...msg,
        createdAt: new Date(msg.createdAt),
      })));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load thread';
      setError(errorMessage);
      console.error('Error loading thread:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearThread = useCallback(() => {
    setThread(null);
    setMessages([]);
    setError(null);
  }, []);

  return {
    thread,
    messages,
    loading,
    error,
    loadThread,
    clearThread,
  };
}




