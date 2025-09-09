"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Edit2, Check, MessageSquare, Wifi, WifiOff } from 'lucide-react';
import { useAgents } from '@inngest/use-agents';
import { ResponsivePromptInput } from '@/components/ai-elements/prompt-input';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { MessageTitle } from '@/components/chat/message';
import { MessagePart } from '@/components/chat/message-parts';
import { Badge } from '@/components/ui/badge';
import type { SubChatData } from '@/app/multi-chat/page';

interface SubChatProps {
  subchat: SubChatData;
  onClose: (subchatId: string) => void;
  onRename: (subchatId: string, newTitle: string) => void;
  showCloseButton: boolean;
}

const mockSuggestions = [
  "Hello! How can I help you?",
  "What's on your mind?",
  "Tell me about your day",
  "Ask me anything!",
];

export function SubChat({ subchat, onClose, onRename, showCloseButton }: SubChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(subchat.title);
  const [isClientSide, setIsClientSide] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Set client-side flag to avoid hydration mismatch with debug info
  useEffect(() => {
    setIsClientSide(true);
  }, []);

  // Unified hook instance (consolidated logic)
  const agent = useAgents({ debug: true });

  // Ensure the subchat controls the active thread immediately
  useEffect(() => {
    agent.setCurrentThreadId(subchat.threadId);
  }, [agent.setCurrentThreadId, subchat.threadId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || agent.status !== "idle") return;
    
    console.log(`🔄 [SUBCHAT-${subchat.id.substring(0, 8)}] Sending message:`, {
      threadId: subchat.threadId,
      message: inputValue.substring(0, 50) + "...",
      agentStatus: agent.status,
      timestamp: new Date().toISOString()
    });

    await agent.sendMessage(inputValue);
    setInputValue("");
  }, [inputValue, agent, subchat.id, subchat.threadId]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputValue(suggestion);
  }, []);

  const handleTitleEdit = useCallback(() => {
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }, []);

  const handleTitleSave = useCallback(() => {
    if (editTitle.trim() && editTitle !== subchat.title) {
      onRename(subchat.id, editTitle.trim());
    } else {
      setEditTitle(subchat.title); // Reset if unchanged or empty
    }
    setIsEditingTitle(false);
  }, [editTitle, subchat.title, subchat.id, onRename]);

  const handleTitleCancel = useCallback(() => {
    setEditTitle(subchat.title);
    setIsEditingTitle(false);
  }, [subchat.title]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  }, [handleTitleSave, handleTitleCancel]);

  const handleApprove = useCallback(async (toolCallId: string) => {
    console.log(`[SubChat-${subchat.id}] Tool ${toolCallId} approved`);
    // Implement tool approval logic here
  }, [subchat.id]);

  const handleDeny = useCallback(async (toolCallId: string, reason?: string) => {
    console.log(`[SubChat-${subchat.id}] Tool ${toolCallId} denied`, reason ? `with reason: ${reason}` : '');
    // Implement tool denial logic here
  }, [subchat.id]);

  // 🔍 TELEMETRY: Log agent creation and status changes for debugging
  useEffect(() => {
    console.log(`🔧 [SUBCHAT-${subchat.id.substring(0, 8)}] Agent initialized:`, {
      threadId: subchat.threadId,
      agentStatus: agent.status,
      isConnected: agent.isConnected,
      messageCount: agent.messages.length,
      timestamp: new Date().toISOString()
    });
  }, []); // Only log on initial mount

  useEffect(() => {
    console.log(`📊 [SUBCHAT-${subchat.id.substring(0, 8)}] Status change:`, {
      status: agent.status,
      isConnected: agent.isConnected,
      messageCount: agent.messages.length,
      threadId: subchat.threadId,
      timestamp: performance.now()
    });
  }, [agent.status, agent.isConnected, agent.messages.length, subchat.id, subchat.threadId]);

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-background h-full min-h-0">
      {/* SubChat Header */}
      <div className="border-b p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            {isEditingTitle ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleTitleSave}
                  className="flex-1 px-1 py-0 text-sm bg-background border-b border-input focus:outline-none focus:border-primary"
                  placeholder="Chat title..."
                />
                <button
                  onClick={handleTitleSave}
                  className="p-1 hover:bg-muted rounded-sm"
                  title="Save title"
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <span className="font-medium text-sm truncate">{subchat.title}</span>
                <button
                  onClick={handleTitleEdit}
                  className="p-1 hover:bg-muted rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit title"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Connection Status */}
            <div className="flex items-center gap-1">
              {agent.isConnected ? (
                <Wifi className="h-3 w-3 text-green-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-red-500" />
              )}
              <Badge variant={agent.status === 'idle' ? "default" : agent.status === 'error' ? "destructive" : "secondary"} 
                     className="text-xs">
                {agent.status}
              </Badge>
            </div>
            
            {/* Close Button */}
            {showCloseButton && (
              <button
                onClick={() => onClose(subchat.id)}
                className="p-1 hover:bg-muted rounded-sm"
                title="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {agent.messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Start a conversation</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              This is your personal subchat. Send a message to get started!
            </p>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {mockSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-left p-2 rounded border hover:bg-muted transition-colors text-sm"
                  disabled={agent.status !== 'idle'}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Conversation className="flex-1 min-h-0">
            <ConversationContent className="p-3">
              {agent.messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  {message.role === 'assistant' && (
                    <MessageTitle currentAgent={undefined} />
                  )}
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
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        )}

        {/* Input */}
        <div className="p-3 border-t">
          <ResponsivePromptInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder="Message this subchat..."
            disabled={!agent.isConnected || agent.status !== 'idle'}
            status={
              agent.status === 'thinking' ? 'submitted' :
              agent.status === 'responding' ? 'streaming' :
              agent.status === 'error' ? 'error' :
              undefined
            }
          />
        </div>
      </div>

      {/* Debug Info - Only show on client to avoid hydration mismatch */}
      {isClientSide && (
        <div className="border-t bg-muted/50 px-3 py-2">
          <div className="text-xs text-muted-foreground">
            <div className="flex justify-between items-center">
              <span>Thread: {subchat.threadId.substring(0, 12)}...</span>
              <span>{agent.messages.length} messages</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
