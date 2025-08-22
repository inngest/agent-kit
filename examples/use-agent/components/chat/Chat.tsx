"use client";

import { useState } from "react";
import { v4 as uuidv4 } from 'uuid';
import {
  useAgent, // orchestrates the agent and realtime event stream
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
}

const mockSuggestions = [
  "How can I track my order?",
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

export function Chat({ threadId: providedThreadId }: ChatProps) {
  const [threadId, setThreadId] = useState(providedThreadId || uuidv4());
  const [inputValue, setInputValue] = useState("I need a refund");
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [loadedThreadMessages, setLoadedThreadMessages] = useState<any[]>([]);
  const [isViewingLoadedThread, setIsViewingLoadedThread] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const isMobile = useIsMobile();

  const { 
    sidebarMinimized, 
    mobileSidebarOpen, 
    setMobileSidebarOpen, 
    toggleSidebar 
  } = useSidebar();

  const { copyMessage, likeMessage, dislikeMessage, readAloud, shareMessage } = useMessageActions();

  const { 
    messages, 
    status, 
    sendMessage, 
    regenerate,
    isConnected, 
    currentAgent, 
    error, 
    clearError 
  } = useAgent({
    threadId,
  });

  const {
    editingMessage,
    editValue,
    setEditValue,
    handleEditMessage,
    handleSaveEdit,
    handleCancelEdit,
  } = useEditMessage({ sendMessage });

  // Reasoning component internally tracks duration via isStreaming; no extra timers needed here.

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || status !== "idle") return;

    // If we're viewing a loaded thread, switch back to live mode when sending a message
    if (isViewingLoadedThread) {
      setIsViewingLoadedThread(false);
      setLoadedThreadMessages([]);
    }

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
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
  };

  const handleRegenerateFrom = (message: any) => {
    // Find the user message that preceded this assistant message
    const messageIndex = messages.findIndex(m => m.id === message.id);
    const precedingUserMessage = messages.slice(0, messageIndex).reverse().find(m => m.role === 'user');
    
    if (precedingUserMessage) {
      const userContent = precedingUserMessage.parts
        .filter(part => part.type === 'text')
        .map(part => (part as any).content)
        .join(' ');
      
      if (userContent.trim()) {
        sendMessage(userContent);
      }
    }
  };

  const handleNewChat = () => {
    // Generate new thread ID and reset everything
    const newThreadId = uuidv4();
    setThreadId(newThreadId);
    setIsViewingLoadedThread(false);
    setLoadedThreadMessages([]);
    setThreadLoading(false);
  };

  const handleThreadSelect = async (selectedThreadId: string) => {
    if (selectedThreadId === threadId && isViewingLoadedThread) return; // Already viewing this thread
    
    // Immediately clear current conversation and show blank state
    setThreadId(selectedThreadId);
    setIsViewingLoadedThread(true);
    setLoadedThreadMessages([]); // Clear immediately (goes blank/white)
    setThreadLoading(true);
    
    try {
      const response = await fetch(`/api/threads/${selectedThreadId}`);
      if (!response.ok) {
        throw new Error('Failed to load thread');
      }
      
      const data = await response.json();
      
      // Convert loaded messages to the format expected by the UI
      const convertedMessages = data.messages.map((msg: any, index: number) => {
        if (msg.type === 'user') {
          return {
            id: `loaded-${index}`,
            role: 'user' as const,
            parts: [{
              type: 'text' as const,
              id: `loaded-text-${index}`,
              content: msg.content || 'No content',
              status: 'complete' as const
            }],
            createdAt: new Date(msg.createdAt),
          };
        } else {
          // For agent messages, extract content from the data.output array
          let content = 'No content';
          if (msg.data?.output && Array.isArray(msg.data.output)) {
            const textMessage = msg.data.output.find((output: any) => output.type === 'text' && output.role === 'assistant');
            if (textMessage?.content) {
              content = textMessage.content;
            }
          }
          
          return {
            id: `loaded-${index}`,
            role: 'assistant' as const,
            parts: [{
              type: 'text' as const,
              id: `loaded-text-${index}`,
              content,
              status: 'complete' as const
            }],
            agentName: msg.agentName,
            createdAt: new Date(msg.createdAt),
          };
        }
      });
      
      setLoadedThreadMessages(convertedMessages);
    } catch (err) {
      console.error('Failed to load thread:', err);
      // Reset to new chat state on error
      handleNewChat();
    } finally {
      setThreadLoading(false);
    }
  };

  const handleDeleteConversation = async () => {
    try {
      const res = await fetch('/api/chat/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });
      if (!res.ok) throw new Error('Failed to delete conversation');
      toast.success('Conversation deleted');
    } catch (err) {
      console.error('[Chat] Delete conversation failed:', err);
      toast.error('Could not delete this conversation');
    }
  };

  const handleSearchChat = () => {
    console.log('Search chat');
    // TODO: Implement chat search functionality
  };

  // Determine which messages to display: loaded thread vs live conversation
  const displayMessages = isViewingLoadedThread ? loadedThreadMessages : messages;

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
          currentThreadId={isViewingLoadedThread ? threadId : null}
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
            currentThreadId={isViewingLoadedThread ? threadId : null}
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

        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} threadId={threadId} />

        <div className="flex flex-col h-full p-0 max-w-none overflow-hidden pt-12 xl:pt-6">
          <div className="flex flex-col h-full min-h-0">
        
            {/* Error Banner */}
            {error && (<MessageError error={error} onDismiss={clearError} />)}

            {displayMessages.length === 0 && !threadLoading ? (
              <EmptyState
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                status={status}
                isConnected={isConnected}
                suggestions={mockSuggestions}
                onSuggestionClick={handleSuggestionClick}
              />
            ) : (
            <Conversation className="flex-1 min-h-0 m-0 p-0 px-[1px]">
              <ConversationContent className="p-0 pt-4 pb-12 px-3">
                {displayMessages.map((message, messageIndex) => (
                  <div key={message.id}>
                

                    {/* Reasoning indicator above the assistant message using shared component */}
                    {message.role === 'assistant' && message.id === lastAssistantId && (
                      <div className="mb-6 relative left-0.5">
                        <Reasoning 
                          className="w-full"
                          isStreaming={status === 'thinking' || status === 'responding'}
                          hasStreamStarted={message.parts.some((p: any) => p?.type === 'text' && typeof p?.content === 'string' && p.content.length > 0)}
                          defaultOpen={false}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{mockReasoningContent}</ReasoningContent>
                        </Reasoning>
                      </div>
                    )}

                    {message.role === 'assistant' ? (
                      <div>
                        {/* Reasoning dropdown stays the same component; it will auto-close when streaming ends */}

                        {(() => {
                          const hasTextDelta = message.parts.some((p: any) => p?.type === 'text' && typeof p?.content === 'string' && p.content.length > 0);
                          const hasCompletedText = message.parts.some((p: any) => p?.type === 'text' && p?.status === 'complete' && typeof p?.content === 'string' && p.content.length > 0);
                          return (
                            <>
                              <Message from={message.role} key={message.id} className="flex-col items-start">
                                {hasTextDelta && (
                                  <MessageTitle currentAgent={currentAgent} />
                                )}
                                <MessageContent className="px-0.5">
                                  {message.parts.map((part, index) => (
                                    <MessagePart 
                                      key={index} 
                                      part={part} 
                                      index={index} 
                                      onApprove={handleApprove} 
                                      onDeny={handleDeny} 
                                    />
                                  ))}
                                </MessageContent>
                              </Message>

                              {/* Show sources for assistant messages - Mock data, only after completion */}
                              <MockedSources hasCompletedText={hasCompletedText} message={message} />

                              {/* Actions only after completion */}
                              {hasCompletedText && (
                                <MessageActions
                                  message={message as any}
                                  onCopyMessage={copyMessage}
                                  onRegenerateFrom={handleRegenerateFrom}
                                  onLikeMessage={likeMessage}
                                  onDislikeMessage={dislikeMessage}
                                  onReadAloud={readAloud}
                                  onShareMessage={shareMessage}
                                />
                              )}
                            </>
                          );
                        })()}

                      </div>
                    ) : (
                      <div 
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
                          <>
                            <Branch>
                              <BranchMessages>
                                <Message from={message.role} key={message.id} className="flex-col items-end">
                                  <MessageContent>
                                    {message.parts.map((part, index) => (
                                      <MessagePart 
                                        key={index} 
                                        part={part} 
                                        index={index} 
                                        onApprove={handleApprove} 
                                        onDeny={handleDeny} 
                                      />
                                    ))}
                                  </MessageContent>
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
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Optimistic and mocked reasoning indicator when no assistant message exists yet */}
                {!lastAssistantId && (status === 'thinking' || status === 'responding') && (
                  <div className="mb-2">
                    <Reasoning 
                      className="w-full"
                      isStreaming={true}
                      hasStreamStarted={status === 'responding'}
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

            {/* Input field - always visible */}
            <div className="px-3 pb-4">
              <ResponsivePromptInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                placeholder={isViewingLoadedThread ? "Continue this conversation..." : "Ask anything"}
                disabled={!isConnected || status !== 'idle' || threadLoading}
                status={
                  status === 'thinking' ? 'submitted' :
                  status === 'responding' ? 'streaming' :
                  status === 'error' ? 'error' :
                  undefined
                }
                className="flex-shrink-0"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



