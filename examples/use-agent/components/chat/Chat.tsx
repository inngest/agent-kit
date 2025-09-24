"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import {
  useAgents, // Unified hook consolidating useChat/useAgent/useThreads
  createDebugLogger, // debug logging utility
  type ConversationMessage,
} from "@inngest/use-agent";
import type { CustomerSupportAgentConfig } from "@/lib/chat-types";
type ChatMessage = ConversationMessage<
  CustomerSupportAgentConfig["tools"],
  CustomerSupportAgentConfig["state"]
>;
type ChatMessages = ConversationMessage<
  CustomerSupportAgentConfig["tools"],
  CustomerSupportAgentConfig["state"]
>[];
import {
  useMessageActions, // handles message actions like copy, edit, regenerate, etc.
  useSidebar, // handles the sidebar state and mobile sidebar open/close
  useEditMessage, // handles the edit message state and edit message functionality
  useIsMobile, // handles the mobile state and mobile sidebar open/close
} from "@/hooks";
import { ResponsivePromptInput } from '@/components/ai-elements/prompt-input';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { MessageActions, MessageTitle, MessageEditor, MessageError } from './message';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/source';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Branch, BranchMessages } from '@/components/ai-elements/branch';
import { MessagePart } from "./message-parts";
import { ChatHeader, HeaderActions } from './header/ChatHeader';
import { ShareDialog } from './header/ShareDialog';
import { DesktopSidebar } from "./sidebar/DesktopSidebar";
import { MobileSidebar } from "./sidebar/MobileSidebar";
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { EmptyState } from './EmptyState';

interface ChatProps {
  threadId?: string;
  debug?: boolean;
}

const mockSuggestions = [
  "I need a refund",
  "What's your return policy?",
  "I need help with billing",
  "Can I change my subscription?",
];

const mockSources = [
  { url: "https://docs.example.com/refund-policy", title: "Refund Policy Documentation" },
  { url: "https://help.example.com/billing", title: "Billing Help Center" },
  { url: "https://support.example.com/returns", title: "Returns & Exchanges" },
];

const mockReasoningContent = `I need to help the user with their refund request. Let me think through this step by step:

1. First, I should understand what type of refund they're requesting
2. Check what our refund policies allow
3. Guide them through the appropriate process
4. Provide clear next steps

Based on our policy documentation, I can see that refunds are typically processed within 5-7 business days for most products, with some exceptions for digital products.`;

interface MockedSourcesProps {
  hasCompletedText: boolean;
  message: any;
}

function MockedSources({ hasCompletedText, message }: MockedSourcesProps) {
  if (!hasCompletedText || mockSources.length === 0 || 
      message.parts.some((part: any) => part.type === 'tool-call')) {
    return null;
  }

  return (
    <Sources>
      <SourcesTrigger count={mockSources.length} />
      <SourcesContent>
        {mockSources.map((source, i) => (
          <Source
            key={i}
            href={source.url}
            title={source.title}
          />
        ))}
      </SourcesContent>
    </Sources>
  );
}

export function Chat({ threadId: providedThreadId, debug = false }: ChatProps = {}) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  
  // Create debug logger
  const logger = useMemo(() => createDebugLogger('Chat', debug), [debug]);

  // used for responsive sidebars
  const isMobile = useIsMobile();

  const { 
    sidebarMinimized, 
    mobileSidebarOpen, 
    setMobileSidebarOpen, 
    toggleSidebar 
  } = useSidebar();

  const { copyMessage, likeMessage, dislikeMessage, readAloud, shareMessage } = useMessageActions({
    showToast: (message, type) => {
      if (type === 'success') {
        toast.success(message);
      } else {
        toast.error(message);
      }
    }
  });

  // Use the unified useAgents hook with URL-provided threadId
  const {
    // Thread management
    currentThreadId,
    threads,
    threadsLoading,
    threadsHasMore,
    threadsError,
    createNewThread,
    deleteThread,
    loadMoreThreads,
    switchToThread,
    setCurrentThreadId,
    
    // Message management
    messages,
    sendMessage,
    
    // Status and state
    status,
    currentAgent,
    isLoadingInitialThread,
    isConnected,
    error,
    clearError,
    
    // HITL actions
    approveToolCall,
    denyToolCall,
  } = useAgents<CustomerSupportAgentConfig>({
    // No need to pass userId - it inherits from AgentProvider automatically!
    initialThreadId: providedThreadId,
    debug: true,
    // Test: Pass a state function to capture current UI context
    state: () => ({
      chatMode: 'support',
      currentSuggestions: mockSuggestions,
      inputValue: inputValue,
      hoveredMessage: hoveredMessage,
      sidebarState: { minimized: sidebarMinimized, mobileOpen: mobileSidebarOpen },
      timestamp: Date.now(),
    })
  });

  const {
    editingMessage,
    editValue,
    setEditValue,
    handleEditMessage,
    handleSaveEdit,
    handleCancelEdit,
  } = useEditMessage({ sendMessage: sendMessage });

  const handleNewChat = () => {
    logger.log('New Chat clicked - current thread:', currentThreadId);
    
    // Create new thread internally without URL navigation
    // URL navigation will happen automatically when user sends first message
    const newThreadId = createNewThread();
    
    logger.log('New Chat created:', { 
      oldThreadId: currentThreadId, 
      newThreadId,
      messagesCleared: messages.length === 0 
    });
    
    // Clear input to give visual feedback that we're in a fresh state
    setInputValue("");

    // Navigate to home so EmptyState is shown until first message is sent
    try { setMobileSidebarOpen(false); } catch {};
    router.push('/');
  };

  const handleThreadSelect = (threadId: string) => {
    // Immediately switch in the client for responsive UX
    try { switchToThread(threadId); } catch {}
    // Keep URL in sync
    router.push(`/chat/${threadId}`);
  };

  // Keep internal thread selection in sync with URL param when provided
  useEffect(() => {
    if (providedThreadId && currentThreadId !== providedThreadId) {
      try { setCurrentThreadId(providedThreadId); } catch {}
    }
  }, [providedThreadId, currentThreadId, setCurrentThreadId]);

  // Thread validation is now handled internally by useChat hook
  // This component should not need to know about thread management complexity

  // Reasoning component internally tracks duration via isStreaming
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || status !== "ready") return;

    const isFirstMessage = messages.length === 0;
    const isOnHomePage = !providedThreadId;
    
    // Send message - useChat handles optimistic thread creation automatically
    // Message ID is automatically generated by useAgent if not provided
    await sendMessage(inputValue);
    setInputValue("");

    // Navigate to thread URL after sending first message from home page
    if (isFirstMessage && isOnHomePage && currentThreadId) {
      router.push(`/chat/${currentThreadId}`);
    }
  };

  const handleApprove = async (toolCallId: string) => {
    try {
      await approveToolCall(toolCallId, "Approved by user");
    } catch (error) {
      logger.error("Failed to approve tool call:", error);
      // Could show a toast notification here
    }
  };

  const handleDeny = async (toolCallId: string, reason?: string) => {
    try {
      await denyToolCall(toolCallId, reason || "Denied by user");
    } catch (error) {
      logger.error("Failed to deny tool call:", error);
      // Could show a toast notification here
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
  };

  const handleRegenerateFrom = (message: ChatMessage) => {
    // Find the user message that preceded this assistant message
    const messageIndex = messages.findIndex((m: ChatMessage) => m.id === message.id);
    const precedingUserMessage = messages.slice(0, messageIndex).reverse().find((m: ChatMessage) => m.role === 'user');
    
    if (precedingUserMessage) {
      const userContent = precedingUserMessage.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => (part as any).content)
        .join(' ');
      
      if (userContent.trim()) {
        // useChat handles everything automatically!
        sendMessage(userContent);
      }
    }
  };

  // Thread management is now handled by useChat - no manual coordination needed!
  const handleDeleteConversation = async () => {
    if (!currentThreadId) return;
    
    try {
      await deleteThread(currentThreadId);
      // After deletion, navigate to home and start a new conversation
      handleNewChat();
      toast.success('Conversation deleted');
    } catch (err) {
      logger.error('Error deleting conversation:', err);
      toast.error('Could not delete this conversation');
    }
  };

  // Enhanced delete function that handles navigation for sidebar deletions
  const handleDeleteThreadWithNavigation = async (threadId: string) => {
    try {
      await deleteThread(threadId);
      
      // If we're deleting the current thread, redirect to home page
      if (currentThreadId === threadId) {
        router.push('/');
        toast.success('Conversation deleted');
      } else {
        toast.success('Conversation deleted');
      }
    } catch (err) {
      logger.error('Error deleting thread:', err);
      toast.error('Could not delete this conversation');
    }
  };

  const handleSearchChat = () => {
    logger.log('Search chat');
    // TODO: Implement chat search functionality
  };

  // useChat provides messages for the current thread
  const displayMessages: ChatMessages = messages;

  // Identify the most recent assistant message (used to position the thinking indicator)
  const lastAssistantId = [...displayMessages].reverse().find(m => m.role === 'assistant')?.id;
  // Unified reasoning UI handles its own duration display.

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Toaster position="bottom-right" richColors duration={2000} />
      {/* Sidebar (desktop/tablet) */}
      {!isMobile && (
        <DesktopSidebar
          isMinimized={sidebarMinimized}
          onToggle={toggleSidebar}
          onNewChat={handleNewChat}
          onSearchChat={handleSearchChat}
          onThreadSelect={handleThreadSelect}
          currentThreadId={currentThreadId}
          threads={threads}
          loading={threadsLoading}
          hasMore={threadsHasMore}
          error={threadsError}
          onLoadMore={loadMoreThreads}
          onDeleteThread={handleDeleteThreadWithNavigation}
        />
      )}
      
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        

        {/* Mobile sidebar sheet */}
        {isMobile && (
          <MobileSidebar
            isOpen={mobileSidebarOpen}
            onOpenChange={setMobileSidebarOpen}
            onNewChat={handleNewChat}
            onSearchChat={handleSearchChat}
            onThreadSelect={handleThreadSelect}
            currentThreadId={currentThreadId}
            threads={threads}
            loading={threadsLoading}
            hasMore={threadsHasMore}
            error={threadsError}
            onLoadMore={loadMoreThreads}
            onDeleteThread={handleDeleteThreadWithNavigation}
          />
        )}
        {/* Responsive chat header (mobile/tablet) within chat area */}
        <ChatHeader
          onNewChat={handleNewChat}
          onDelete={handleDeleteConversation}
          onShare={() => setShareOpen(true)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        {/* Desktop absolute controls in top-right */}
        <HeaderActions
          onNewChat={handleNewChat}
          onDelete={handleDeleteConversation}
          onShare={() => setShareOpen(true)}
        />

        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} threadId={currentThreadId || ''} />

        <div className="flex flex-col h-full p-0 max-w-none overflow-hidden pt-12 xl:pt-6">
          <div className="flex flex-col h-full min-h-0">
        
            {/* Error Banner */}
            {error && (<MessageError error={error} onDismiss={clearError} />)}

            {isLoadingInitialThread ? (
              <div className="flex-1" />
            ) : displayMessages.length === 0 ? (
              <EmptyState
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                status={status as 'ready' | 'submitted' | 'streaming' | 'error'}
                isConnected={isConnected}
                suggestions={mockSuggestions}
                onSuggestionClick={handleSuggestionClick}
              />
            ) : (
            <Conversation className="flex-1 min-h-0 m-0 p-0 px-[1px]">
              <ConversationContent className="p-0 pt-4 pb-12 px-3">
                {displayMessages.map((message, messageIndex: number) => (
                  <div key={message.id}>
                    {/* Reasoning indicator above the assistant message using shared component */}
                    {message.role === 'assistant' && message.id === lastAssistantId && (
                      <div key={`${message.id}-reasoning`} className="mb-6 relative left-0.5">
                        <Reasoning 
                          className="w-full"
                          isStreaming={status === 'submitted' || status === 'streaming'}
                          hasStreamStarted={message.parts.some((p: any) => p?.type === 'text' && typeof p?.content === 'string' && p.content.length > 0)}
                          defaultOpen={false}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{mockReasoningContent}</ReasoningContent>
                        </Reasoning>
                      </div>
                    )}

                    {message.role === 'assistant' ? (
                      <div key={`${message.id}-content`}>
                        {/* Reasoning dropdown stays the same component; it will auto-close when streaming ends */}

                        {(() => {
                          const hasTextDelta = message.parts.some((p: any) => p?.type === 'text' && typeof p?.content === 'string' && p.content.length > 0);
                          const hasCompletedText = message.parts.some((p: any) => p?.type === 'text' && p?.status === 'complete' && typeof p?.content === 'string' && p.content.length > 0);
                          return (
                            <React.Fragment key={`${message.id}-fragment`}>
                              <Message from={message.role} key={`${message.id}-message`} className="flex-col items-start">
                                {hasTextDelta && (
                                  <MessageTitle currentAgent={currentAgent} />
                                )}
                                <MessageContent className="px-0.5">
                                  {message.parts.map((part, index: number) => (
                                    <MessagePart 
                                      key={`${message.id}-part-${index}`}
                                      part={part} 
                                      index={index} 
                                      onApprove={handleApprove} 
                                      onDeny={handleDeny} 
                                    />
                                  ))}
                                </MessageContent>
                              </Message>

                              {/* Show sources for assistant messages - Mock data, only after completion */}
                              <div key={`${message.id}-sources`}>
                                <MockedSources hasCompletedText={hasCompletedText} message={message} />
                              </div>

                              {/* Actions only after completion */}
                              {hasCompletedText && (
                                <div key={`${message.id}-actions`}>
                                  <MessageActions
                                    message={message}
                                    onCopyMessage={copyMessage}
                                    onRegenerateFrom={handleRegenerateFrom}
                                    onLikeMessage={likeMessage}
                                    onDislikeMessage={dislikeMessage}
                                    onReadAloud={readAloud}
                                    onShareMessage={shareMessage}
                                  />
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })()}

                      </div>
                    ) : (
                      <div 
                        key={`${message.id}-user-content`}
                        className="relative"
                        onMouseEnter={() => setHoveredMessage(message.id)}
                        onMouseLeave={() => setHoveredMessage(null)}
                      >
                        {editingMessage === message.id ? (
                          <MessageEditor
                            messageId={message.id}
                            value={editValue}
                            onChange={setEditValue}
                            onSave={handleSaveEdit}
                            onCancel={handleCancelEdit}
                          />
                        ) : (
                          <Branch>
                            <BranchMessages>
                              <Message from={message.role} key={`${message.id}-main`} className="flex-col items-end">
                                <MessageContent>
                                  {message.parts.map((part, index: number) => (
                                    <MessagePart 
                                      key={`${message.id}-part-${index}`}
                                      part={part} 
                                      index={index} 
                                      onApprove={handleApprove} 
                                      onDeny={handleDeny} 
                                    />
                                  ))}
                                </MessageContent>
                                {/* Message Status Indicator */}
                                {message.status && message.status !== 'sent' && (
                                  <div className="text-xs text-muted-foreground pr-2 pt-1">
                                    {message.status === 'sending' ? 'Sending...' : 'Failed'}
                                  </div>
                                )}
                              </Message>
                              {/* Mock branch - alternative way user could have asked */}
                              <Message from={message.role} key={`${message.id}-branch`}>
                                <MessageContent>
                                  <div className="relative w-full whitespace-pre-wrap pr-4">
                                    Testing 123
                                  </div>
                                </MessageContent>
                              </Message>
                            </BranchMessages>
                            
                            {/* Combined user actions and branch selector in one row */}
                            <MessageActions
                              message={message}
                              isHovered={hoveredMessage === message.id}
                              onCopyMessage={copyMessage}
                              onEditMessage={handleEditMessage}
                            />
                          </Branch>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Optimistic and mocked reasoning indicator when no assistant message exists yet */}
                {!lastAssistantId && (status === 'submitted' || status === 'streaming') && (
                  <div className="mb-2">
                    <Reasoning 
                      className="w-full"
                      isStreaming={true}
                      hasStreamStarted={status === 'streaming'}
                      defaultOpen={false}
                    >
                      <ReasoningTrigger />
                      <ReasoningContent simulateTyping>{mockReasoningContent}</ReasoningContent>
                    </Reasoning>
                  </div>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
            )}

            {/* Input field - visible when there are messages or when loading initial thread */}
            {(displayMessages.length > 0 || isLoadingInitialThread) && (
              <div className="px-3 pb-4">
                <ResponsivePromptInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  placeholder="Ask anything"
                  disabled={status !== 'ready' || isLoadingInitialThread}
                  status={
                    status === 'submitted' ? 'submitted' :
                    status === 'streaming' ? 'streaming' :
                    status === 'error' ? 'error' :
                    undefined
                  }
                  className="flex-shrink-0"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



