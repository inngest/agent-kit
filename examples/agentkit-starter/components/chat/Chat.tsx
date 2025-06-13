"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatHeader } from "./ChatHeader";
import { ChatSidebar } from "./ChatSidebar";
import { ArrowUp } from "lucide-react";
import { useChatStream } from "./hooks";

export function Chat() {
  const {
    messages,
    agentResults,
    isLoading,
    threadId,
    totalMessages,
    isLoadingThread,
    sendMessage,
    loadThread,
    startNewChat
  } = useChatStream();

  const [userInput, setUserInput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startScrollTop, setStartScrollTop] = useState(0);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Add and remove mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startY, startScrollTop]);

  // Resize textarea when input changes
  useEffect(() => {
    resizeTextarea();
  }, [userInput]);

  // Initialize textarea on mount
  useEffect(() => {
    if (inputRef.current) {
      resizeTextarea();
      updateCustomScrollbar();
    }
  }, []);

  // Function to resize textarea
  const resizeTextarea = () => {
    const textarea = inputRef.current;
    if (!textarea) return;
    
    // Reset the height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height (with a max of ~6 lines)
    const lineHeight = 24; // Approximated line height in pixels
    const maxHeight = lineHeight * 6;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    
    textarea.style.height = `${newHeight}px`;
    
    // Update custom scrollbar
    updateCustomScrollbar();
  };

  // Function to update custom scrollbar position and size
  const updateCustomScrollbar = () => {
    const textarea = inputRef.current;
    const thumb = thumbRef.current;
    
    if (!textarea || !thumb) return;
    
    const scrollPercentage = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
    const thumbHeight = Math.max(20, (textarea.clientHeight / textarea.scrollHeight) * textarea.clientHeight);
    
    thumb.style.height = `${thumbHeight}px`;
    
    // Only show thumb if content exceeds max height
    if (textarea.scrollHeight > textarea.clientHeight) {
      thumb.style.display = 'block';
      const thumbPosition = scrollPercentage * (textarea.clientHeight - thumbHeight);
      thumb.style.top = `${thumbPosition}px`;
    } else {
      thumb.style.display = 'none';
    }
  };

  // Handle thumb drag start
  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    setStartY(e.clientY);
    
    const textarea = inputRef.current;
    if (textarea) {
      setStartScrollTop(textarea.scrollTop);
    }
  };

  // Handle thumb dragging
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const textarea = inputRef.current;
    if (!textarea) return;
    
    const deltaY = e.clientY - startY;
    const scrollFactor = textarea.scrollHeight / textarea.clientHeight;
    
    textarea.scrollTop = startScrollTop + (deltaY * scrollFactor);
    updateCustomScrollbar();
  };

  // Handle thumb drag end
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle track click to jump to position
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = e.currentTarget;
    const textarea = inputRef.current;
    const thumb = thumbRef.current;
    
    if (!textarea || !thumb) return;
    
    // Get relative position in the track
    const rect = track.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    
    // Calculate thumb height
    const thumbHeight = Math.max(20, (textarea.clientHeight / textarea.scrollHeight) * textarea.clientHeight);
    
    // Calculate new scroll position
    const scrollableHeight = textarea.scrollHeight - textarea.clientHeight;
    const percentage = (relativeY - thumbHeight / 2) / (textarea.clientHeight - thumbHeight);
    const scrollAmount = percentage * scrollableHeight;
    
    // Update scroll position
    textarea.scrollTop = Math.max(0, Math.min(scrollAmount, scrollableHeight));
    updateCustomScrollbar();
  };

  // Handle textarea scroll
  const handleTextareaScroll = () => {
    updateCustomScrollbar();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (userInput.trim() && !isLoading) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  // Handle thread selection from sidebar
  const handleThreadSelect = async (selectedThreadId: string) => {
    if (selectedThreadId === threadId) return; // Already selected
    
    try {
      await loadThread(selectedThreadId);
    } catch (error) {
      console.error('Failed to load thread:', error);
      // Could show a toast notification here
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const messageContent = userInput;
    setUserInput("");

    try {
      await sendMessage(messageContent);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Could show a toast notification here
    }
  };

  const handleNewChat = () => {
    startNewChat();
  };

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-900">
      <style>
        {`
          /* Custom scrollbar styles */
          .custom-scrollbar {
            position: relative;
            overflow-y: auto;
            scrollbar-width: none; /* Firefox */
          }
          
          .custom-scrollbar::-webkit-scrollbar {
            display: none; /* WebKit browsers */
          }
          
          /* Custom scrollbar track */
          .scrollbar-track {
            position: absolute;
            top: 0;
            right: 0;
            width: 8px;
            height: 100%;
            background-color: transparent;
            z-index: 10;
            cursor: pointer;
          }
          
          /* Custom scrollbar thumb */
          .scrollbar-thumb {
            position: absolute;
            width: 6px;
            right: 1px;
            border-radius: 3px;
            background-color: rgba(156, 163, 175, 0.5);
            cursor: grab;
            transition: background-color 0.2s, width 0.2s, right 0.2s;
          }
          
          .scrollbar-thumb:hover,
          .scrollbar-thumb:active {
            background-color: rgba(156, 163, 175, 0.8);
            width: 8px;
            right: 0;
          }
          
          .scrollbar-thumb.dragging {
            cursor: grabbing;
            background-color: rgba(156, 163, 175, 0.8);
            width: 8px;
            right: 0;
          }
          
          .dark .scrollbar-thumb {
            background-color: rgba(161, 161, 170, 0.5);
          }
          
          .dark .scrollbar-thumb:hover,
          .dark .scrollbar-thumb:active,
          .dark .scrollbar-thumb.dragging {
            background-color: rgba(161, 161, 170, 0.8);
          }
        `}
      </style>
      {/* Sidebar */}
      <ChatSidebar
        currentThreadId={threadId}
        onThreadSelect={handleThreadSelect}
        onNewChat={handleNewChat}
        isCollapsed={!sidebarOpen}
      />

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">
        <ChatHeader
          onNewChat={handleNewChat}
          onShareChat={() => {}}
          onViewConversations={() => {}}
          onViewProfile={() => {}}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        
        <div 
          ref={containerRef}
          className="flex-1 overflow-y-auto p-4 space-y-6 px-4 sm:px-8 md:px-12 lg:px-20 xl:px-[20%]"
        >
          {isLoadingThread ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
                <div className="w-5 h-5 border-t-2 border-current rounded-full animate-spin"></div>
                <span>Loading conversation...</span>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-start h-full ml-4 xl:justify-center xl:ml-0">
              <div className="text-left xl:text-center">
                <h2 className="text-2xl font-semibold mb-1 dark:text-white">AgentKit Chat 🤖</h2>
                <p className="text-xl text-gray-500 dark:text-zinc-400 mb-4">
                  Database persistence example
                </p>
                {threadId && (
                  <div className="text-sm text-gray-400 dark:text-zinc-500 space-y-1">
                    <p>Thread: {threadId}</p>
                    <p>Client history: {agentResults.length} • DB total: {totalMessages}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, i) => (
                <ChatMessage key={i} message={message} />
              ))}
              {threadId && (
                <div className="text-xs text-gray-400 dark:text-zinc-500 text-center space-y-1">
                  <div>Thread ID: {threadId}</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-8">
          <form onSubmit={handleSubmit} className="relative">
            <div className="w-full rounded-[24px] px-6 py-3 pt-4 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm relative">
              <div className="relative pr-12">
                <textarea 
                  ref={inputRef}
                  className="custom-scrollbar w-full bg-transparent border-none focus:ring-0 focus:outline-none text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 resize-none min-h-[24px]"
                  placeholder="Type a message..."
                  value={userInput}
                  onChange={(e) => {
                    setUserInput(e.target.value);
                    resizeTextarea();
                  }}
                  onKeyDown={handleKeyDown}
                  onScroll={handleTextareaScroll}
                  rows={1}
                  disabled={isLoading || isLoadingThread}
                />
                <div className="scrollbar-track" onClick={handleTrackClick}>
                  <div 
                    ref={thumbRef} 
                    className={`scrollbar-thumb ${isDragging ? 'dragging' : ''}`}
                    onMouseDown={handleThumbMouseDown}
                  ></div>
                </div>
              </div>

              {/* Floating submit button */}
              <button 
                type="submit"
                className="absolute right-2 bottom-2.5 p-2 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none transition-colors"
                disabled={!userInput.trim() || isLoading || isLoadingThread}
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-t-2 border-current rounded-full animate-spin"></div>
                ) : (
                  <ArrowUp size={20} />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 