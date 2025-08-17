
"use client";

import { useState } from "react";
import { v4 as uuidv4 } from 'uuid';
import { GlobeIcon, SearchIcon, BookIcon, BrainIcon, RefreshCcwIcon, CopyIcon, ThumbsUpIcon, ThumbsDownIcon, VolumeXIcon, ShareIcon, EditIcon } from 'lucide-react';
import { useAgent } from "@/hooks/use-agent";
import { ConnectionStatus } from "./ConnectionStatus";
import { Sidebar } from "./Sidebar";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageAvatar } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Response } from '@/components/ai-elements/response';
import { Loader } from '@/components/ai-elements/loader';
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
import {
  Suggestions,
  Suggestion,
} from '@/components/ai-elements/suggestion';
import {
  Actions,
  Action,
} from '@/components/ai-elements/actions';
import {
  Branch,
  BranchMessages,
  BranchSelector,
  BranchPrevious,
  BranchNext,
  BranchPage,
} from '@/components/ai-elements/branch';
import { MessagePart } from "./messages/MessagePart";

interface ChatProps {
  threadId?: string;
}

// Mock data for UI demonstration
const models = [
  { name: 'GPT-4o', value: 'openai/gpt-4o' },
  { name: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3-5-sonnet' },
  { name: 'Gemini Pro', value: 'google/gemini-pro' },
];

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

export function Chat({ threadId: providedThreadId }: ChatProps) {
  const [threadId] = useState(providedThreadId || uuidv4());
  const [inputValue, setInputValue] = useState("I need a refund");
  const [model, setModel] = useState<string>(models[0].value);
  const [webSearch, setWebSearch] = useState(false);
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [sidebarMinimized, setSidebarMinimized] = useState(false);

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

  const handleCopyMessage = (message: any) => {
    const textContent = message.parts
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.content)
      .join('\n');
    
    if (textContent.trim()) {
      navigator.clipboard.writeText(textContent);
    }
  };

  const handleEditMessage = (message: any) => {
    const textContent = message.parts
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.content)
      .join('\n');
    
    setEditingMessage(message.id);
    setEditValue(textContent);
  };

  const handleSaveEdit = (messageId: string) => {
    if (editValue.trim()) {
      // For now, just send as a new message
      // In a real implementation, you might want to update the existing message
      sendMessage(editValue);
    }
    setEditingMessage(null);
    setEditValue("");
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditValue("");
  };

  const handleThumbsUp = (messageId: string) => {
    console.log(`Thumbs up for message: ${messageId}`);
    // TODO: Implement feedback tracking
  };

  const handleThumbsDown = (messageId: string) => {
    console.log(`Thumbs down for message: ${messageId}`);
    // TODO: Implement feedback tracking
  };

  const handleReadAloud = (message: any) => {
    const textContent = message.parts
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.content)
      .join(' ');
    
    if (textContent.trim() && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textContent);
      speechSynthesis.speak(utterance);
    }
  };

  const handleShare = (message: any) => {
    const textContent = message.parts
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.content)
      .join('\n');
    
    if (navigator.share && textContent.trim()) {
      navigator.share({
        title: 'AI Assistant Response',
        text: textContent,
      }).catch(console.error);
    } else if (textContent.trim()) {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(textContent);
      console.log('Response copied to clipboard');
    }
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
    console.log('Starting new chat');
    // TODO: Implement new chat functionality
  };

  const handleSearchChat = () => {
    console.log('Search chat');
    // TODO: Implement chat search functionality
  };

  const toggleSidebar = () => {
    setSidebarMinimized(!sidebarMinimized);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isMinimized={sidebarMinimized}
        onToggle={toggleSidebar}
        onNewChat={handleNewChat}
        onSearchChat={handleSearchChat}
      />
      
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex flex-col h-full p-6 max-w-none overflow-hidden">
          <div className="flex flex-col h-full min-h-0">
        <ConnectionStatus isConnected={isConnected} currentAgent={currentAgent} />
        
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded">
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

        <Conversation className="flex-1 min-h-0">
          <ConversationContent>
            {messages.map((message, messageIndex) => (
              <div key={message.id}>
            

                {/* Mock reasoning for assistant messages */}
                {message.role === 'assistant' && (
                  <Reasoning 
                    className="w-full"
                    isStreaming={status === 'responding'}
                    defaultOpen={false}
                    duration={3}
                  >
                    <ReasoningTrigger />
                    <ReasoningContent>{mockReasoningContent}</ReasoningContent>
                  </Reasoning>
                )}

                {message.role === 'assistant' ? (
                  <div>
                    <Message from={message.role} key={message.id} className="flex-col items-start">
                      <div className="flex flex-row items-center gap-2">
                        <MessageAvatar 
                          src="/bot-avatar.png"
                          name="Assistant" 
                        />
                        <span className="text-sm text-muted-foreground font-medium">
                          {currentAgent || 'Assistant'}
                        </span>
                      </div>
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
                    
                    {/* Show sources for assistant messages - Mock data */}
                    {mockSources.length > 0 && 
                     !message.parts.some(part => part.type === 'tool-call') && (
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
                    )}
                    
                    {/* Actions for all assistant messages */}
                    <Actions className="mt-0 ml-0">
                      <Action
                        onClick={() => handleCopyMessage(message)}
                        tooltip="Copy message"
                        label="Copy"
                      >
                        <CopyIcon className="size-3" />
                      </Action>
                      <Action
                        onClick={() => handleThumbsUp(message.id)}
                        tooltip="Good response"
                        label="Thumbs up"
                      >
                        <ThumbsUpIcon className="size-3" />
                      </Action>
                      <Action
                        onClick={() => handleThumbsDown(message.id)}
                        tooltip="Bad response"
                        label="Thumbs down"
                      >
                        <ThumbsDownIcon className="size-3" />
                      </Action>
                      <Action
                        onClick={() => handleReadAloud(message)}
                        tooltip="Read aloud"
                        label="Read aloud"
                      >
                        <VolumeXIcon className="size-3" />
                      </Action>
                      <Action
                        onClick={() => handleShare(message)}
                        tooltip="Share message"
                        label="Share"
                      >
                        <ShareIcon className="size-3" />
                      </Action>
                      <Action
                        onClick={() => handleRegenerateFrom(message)}
                        tooltip="Regenerate from this point"
                        label="Regenerate"
                      >
                        <RefreshCcwIcon className="size-3" />
                      </Action>
                    </Actions>
                  </div>
                ) : (
                  <div 
                    className="relative"
                    onMouseEnter={() => setHoveredMessage(message.id)}
                    onMouseLeave={() => setHoveredMessage(null)}
                  >
                    {editingMessage === message.id ? (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={Math.max(2, editValue.split('\n').length)}
                        />
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleSaveEdit(message.id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Save & Send
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
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
                                  {/* Alternative phrasing for the same intent */}
                                  Testing 123
                                </div>
                              </MessageContent>
                            </Message>
                          </BranchMessages>
                          
                          {/* Combined user actions and branch selector in one row */}
                          <div className={`flex items-center justify-between mt-2 mr-0 transition-opacity duration-200 ${
                            hoveredMessage === message.id ? 'opacity-100' : 'opacity-0'
                          }`}>
                            <div className="flex-1" />
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <Action
                                  onClick={() => handleCopyMessage(message)}
                                  tooltip="Copy message"
                                  label="Copy"
                                >
                                  <CopyIcon className="size-3" />
                                </Action>
                                <Action
                                  onClick={() => handleEditMessage(message)}
                                  tooltip="Edit message"
                                  label="Edit"
                                >
                                  <EditIcon className="size-3" />
                                </Action>
                              </div>
                              <BranchSelector from={message.role}>
                                <BranchPrevious />
                                <BranchPage />
                                <BranchNext />
                              </BranchSelector>
                            </div>
                          </div>
                        </Branch>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Show loader when processing */}
            {(status === 'thinking' || status === 'responding') && (
              <div className="flex justify-start">
  
                    <Loader />
   
              </div>
            )}

            {/* Show suggestions when no messages */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <h2 className="text-lg font-semibold text-gray-700">How can I help you today?</h2>
                <Suggestions>
                  {mockSuggestions.map((suggestion, i) => (
                    <Suggestion
                      key={i}
                      suggestion={suggestion}
                      onClick={handleSuggestionClick}
                    />
                  ))}
                </Suggestions>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput onSubmit={handleSubmit} className="mt-4 flex-shrink-0">
          <PromptInputTextarea
            onChange={(e) => setInputValue(e.target.value)}
            value={inputValue}
            placeholder="Type your message..."
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton
                variant={webSearch ? 'default' : 'ghost'}
                onClick={() => setWebSearch(!webSearch)}
              >
                <GlobeIcon size={16} />
                <span>Search</span>
              </PromptInputButton>
              <PromptInputButton variant="ghost">
                <SearchIcon size={16} />
                <span>Knowledge</span>
              </PromptInputButton>
              <PromptInputButton variant="ghost">
                <BookIcon size={16} />
                <span>Docs</span>
              </PromptInputButton>
              <PromptInputModelSelect
                onValueChange={(value) => setModel(value)}
                value={model}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem key={model.value} value={model.value}>
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit 
              disabled={!inputValue.trim() || !isConnected || status !== "idle"} 
              status={
                status === 'thinking' ? 'submitted' :
                status === 'responding' ? 'streaming' :
                status === 'error' ? 'error' :
                undefined
              } 
            />
          </PromptInputToolbar>
        </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
