"use client";

import { useState, useEffect } from "react";
import { Plus, MessageSquare, Trash2, MoreHorizontal } from "lucide-react";

interface Thread {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: any;
}

interface ChatSidebarProps {
  currentThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  onNewChat: () => void;
  isCollapsed?: boolean;
}

export function ChatSidebar({ 
  currentThreadId, 
  onThreadSelect, 
  onNewChat,
  isCollapsed = false 
}: ChatSidebarProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load threads from the API
  const loadThreads = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/threads");
      if (response.ok) {
        const data = await response.json();
        setThreads(data.threads || []);
      }
    } catch (error) {
      console.error("Failed to load threads:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a thread
  const deleteThread = async (threadId: string) => {
    try {
      const response = await fetch(`/api/threads/${threadId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setThreads(prev => prev.filter(t => t.thread_id !== threadId));
        if (currentThreadId === threadId) {
          onNewChat(); // Switch to new chat if current thread was deleted
        }
      }
    } catch (error) {
      console.error("Failed to delete thread:", error);
    }
    setDeleteConfirm(null);
  };

  // Load threads on component mount
  useEffect(() => {
    loadThreads();
  }, []);

  // Refresh threads when a new thread is created
  useEffect(() => {
    if (currentThreadId && !threads.find(t => t.thread_id === currentThreadId)) {
      loadThreads();
    }
  }, [currentThreadId]);

  // Generate thread title from metadata
  const getThreadTitle = (thread: Thread): string => {
    if (thread.metadata?.query) {
      const query = thread.metadata.query.trim();
      return query.length > 50 ? query.substring(0, 50) + "..." : query;
    }
    return `Chat ${new Date(thread.created_at).toLocaleDateString()}`;
  };

  // Format date for display
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Group threads by date
  const groupedThreads = threads.reduce((groups: Record<string, Thread[]>, thread) => {
    const date = new Date(thread.updated_at);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let groupKey: string;
    if (diffDays === 0) {
      groupKey = "Today";
    } else if (diffDays === 1) {
      groupKey = "Yesterday";
    } else if (diffDays < 7) {
      groupKey = "Last 7 days";
    } else if (diffDays < 30) {
      groupKey = "Last 30 days";
    } else {
      groupKey = "Older";
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(thread);
    return groups;
  }, {});

  if (isCollapsed) {
    return (
      <div className="w-16 h-full bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col items-center py-4">
        <button
          onClick={onNewChat}
          className="w-10 h-10 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          title="New Chat"
        >
          <Plus className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 h-full bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <Plus className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            New Chat
          </span>
        </button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your conversations will appear here once you start chatting!
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedThreads).map(([groupName, groupThreads]) => (
              <div key={groupName}>
                <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 px-2">
                  {groupName}
                </h3>
                <div className="space-y-1">
                  {groupThreads.map((thread) => (
                    <div
                      key={thread.thread_id}
                      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        currentThreadId === thread.thread_id
                          ? "bg-zinc-200 dark:bg-zinc-800"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                      onClick={() => onThreadSelect(thread.thread_id)}
                    >
                      <MessageSquare className="w-4 h-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
                          {getThreadTitle(thread)}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {formatDate(thread.updated_at)}
                        </p>
                      </div>
                      
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(thread.thread_id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              Delete conversation?
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              This will permanently delete this conversation and cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteThread(deleteConfirm)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 