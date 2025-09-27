"use client";

import { 
  useAgents,
  type ConversationMessage, 
  createDebugLogger
} from '@inngest/use-agent';
import { createInMemorySessionTransport } from '@inngest/use-agent';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Conversation, 
  ConversationContent, 
  ConversationScrollButton 
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { MessagePart } from '@/components/chat/message-parts';
import { MessageTitle, MessageEditor } from '@/components/chat/message';
import { Actions, Action } from '@/components/ai-elements/actions';
import { ResponsivePromptInput } from '@/components/ai-elements/prompt-input';
import { SqlToolPart } from './SqlToolPart';
import { useEditMessage, useMessageActions } from '@/hooks';
import { CopyIcon, EditIcon } from 'lucide-react';

interface EphemeralChatProps {
  threadId: string;
  storageType: 'session' | 'local';
  userId: string;
  currentSql: string; // Current SQL query for context
  tabTitle: string; // Tab title for context
  onSqlChange: (sql: string) => void; // NEW: Callback to update SQL in editor
  debug?: boolean; // Optional: enable debug logging
}

export function EphemeralChat({ threadId, storageType, userId, currentSql, tabTitle, onSqlChange, debug = false }: EphemeralChatProps) {
  // Import debug logger
  const logger = useMemo(() => createDebugLogger('EphemeralChat', debug), [debug]);

  // Use in-memory session transport (no persistence).
  const transport = useMemo(() => createInMemorySessionTransport(), []);
  
  // Message actions (copy, edit, etc.) - same as main Chat
  const { copyMessage, likeMessage, dislikeMessage, readAloud, shareMessage } = useMessageActions();

  const { 
    messages, 
    sendMessage,
    sendMessageToThread, 
    status, 
    currentThreadId, 
    setCurrentThreadId,
    clearThreadMessages,
    replaceThreadMessages,
    rehydrateMessageState // NEW: State rehydration function
  } = useAgents({
    // DON'T pass initialThreadId - prevents automatic database loading
    userId,
    // Disable thread validation for ephemeral persistence layers
    // Ephemeral threads don't exist in a traditional database, so validation would always fail
    enableThreadValidation: false,
    // Cast to any to allow local dev before build updates package types
    transport,
    
    // ✅ CAPTURE: Current SQL query as state for AI context
    state: () => ({
      sqlQuery: currentSql,
      tabTitle,
      storageType,
      mode: 'sql_playground',
      timestamp: Date.now(),
    }),
    
    // ✅ REHYDRATE: Restore UI state when editing messages from previous contexts
    onStateRehydrate: (messageState: Record<string, unknown>, messageId: string) => {
      logger.log('stateRehydration', {
        messageId,
        messageState,
        currentSql,
        currentTab: tabTitle,
        timestamp: new Date().toISOString()
      });
      
      // Restore SQL query in editor if it was different
      if (messageState.sqlQuery && messageState.sqlQuery !== currentSql) {
        logger.log('Rehydrating SQL query:', { from: currentSql, to: messageState.sqlQuery });
        onSqlChange(messageState.sqlQuery as string);
      }
      
      // Could restore other UI state here (tab switching, form fields, etc.)
      // if (messageState.tabTitle && messageState.tabTitle !== tabTitle) {
      //   onTabSwitch(messageState.tabTitle);
      // }
    },
    
  } as any);

  // Initialize ephemeral chat with proper thread switching
  useEffect(() => {
    // Set the current thread immediately (no database loading)
    setCurrentThreadId(threadId);
  }, [threadId, setCurrentThreadId]);



  // Message editing
  const { 
    editingMessage, 
    editValue, 
    setEditValue, 
    handleEditMessage, 
    handleSaveEdit, 
    handleCancelEdit 
  } = useEditMessage({ 
    sendMessage: async (content: string) => {
      // Simple message sending for editing (no branching)
      if (editingMessage) {
        logger.log('messageEditStart', {
          editedMessageId: editingMessage,
          editedContent: content.substring(0, 50) + '...',
          timestamp: new Date().toISOString()
        });
        
        // Send the edited message
        await sendMessage(content);
        setEditValue("");
      }
    }
  });

  // Custom edit handler that triggers state rehydration
  const customHandleEditMessage = useCallback((messageId: string) => {
    // Find the message object by ID
    const message = messages.find(m => m.id === messageId);
    if (!message) {
      logger.error('Message not found for editing:', messageId);
      return;
    }
    
    // ✅ REHYDRATE: Restore UI state from when this message was originally sent
    rehydrateMessageState(messageId);
    
    // Then start editing normally with the message object
    handleEditMessage(message);
  }, [messages, rehydrateMessageState, handleEditMessage]);
  
  // Check if the assistant has started showing actual content (not just the message structure)
  const hasAssistantContentStarted = useCallback(() => {
    // Find the last assistant message
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage) return false;
    
    // Check if any text parts have actual content
    const hasTextContent = lastAssistantMessage.parts.some(part => 
      part.type === 'text' && (part as any).content && (part as any).content.trim().length > 0
    );
    
    // Check if any tool calls have started showing output
    const hasToolOutput = lastAssistantMessage.parts.some(part => 
      part.type === 'tool-call' && (part as any).output !== undefined
    );
    
    return hasTextContent || hasToolOutput;
  }, [messages]);
  
  useEffect(() => {
    if (threadId !== currentThreadId) {
      // Use the low-level escape hatch for immediate switching
      // Perfect for ephemeral scenarios - no database history to load!
      setCurrentThreadId(threadId);
    }
  }, [threadId, currentThreadId, setCurrentThreadId]);

  const [inputValue, setInputValue] = useState("");

  // Memoize handleSubmit to prevent unnecessary re-renders that can cause flickering
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || status !== 'idle') return;
    
    await sendMessage(inputValue);
    setInputValue("");
  }, [inputValue, status, sendMessage]);

  // Clear chat messages for fresh conversation
  const handleClearChat = useCallback(() => {
    clearThreadMessages(threadId);
  }, [threadId, clearThreadMessages]);

  // Memoize the input status to prevent constant recalculation
  const inputStatus = useMemo(() => {
    switch (status) {
      case 'thinking': return 'submitted';
      case 'responding': return 'streaming';  
      case 'error': return 'error';
      default: return undefined;
    }
  }, [status]);

  // Empty state for when no messages exist
  const EmptyState = () => (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center text-gray-500">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.418 8-9 8a9.013 9.013 0 01-5.314-1.686l-4.243.529a1.125 1.125 0 01-1.356-1.356l.529-4.243A8.963 8.963 0 013 12c0-4.97 4.03-9 9-9s9 4.03 9 9z" />
          </svg>
        </div>
        <div className="text-sm font-medium mb-1">What can I help you query?</div>
        <div className="text-xs text-gray-400">Ask about your SQL query, get help with optimization, or request explanations</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Chat Header - Enhanced with branching controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm font-medium text-gray-700">AI Assistant</span>
          <span className="text-xs text-gray-400">({storageType})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            disabled={messages.length === 0 || status !== 'idle'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear chat"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>
        </div>
      </div>

      {/* Messages Area - Use proper Conversation components for scrolling */}
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <Conversation className="flex-1 min-h-0 bg-white">
          <ConversationContent className="p-4">
            {messages.map((message, messageIndex) => (
              <div key={message.id}>
                {message.role === 'assistant' ? (
                  <Message from={message.role} className="flex-col items-start">
                    <MessageTitle currentAgent="SQL Assistant" />
                    <MessageContent>
                      {message.parts.map((part, index) => (
                        part.type === 'tool-call' ? (
                          <SqlToolPart 
                            key={index}
                            part={part}
                            onInsertSql={onSqlChange}
                          />
                        ) : (
                          <MessagePart 
                            key={index} 
                            part={part} 
                            index={index} 
                            onApprove={() => {}} 
                            onDeny={() => {}} 
                          />
                        )
                      ))}
                    </MessageContent>
                  </Message>
                ) : (
                  <div className="relative group">
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
                        <Message from={message.role} className="flex-col items-end">
                          <MessageContent>
                            {message.parts.map((part, index) => (
                              <MessagePart 
                                key={index} 
                                part={part} 
                                index={index} 
                                onApprove={() => {}} 
                                onDeny={() => {}} 
                              />
                            ))}
                          </MessageContent>
                        </Message>
                        {/* Message actions */}
                        <div className="flex items-center justify-between mt-0 mr-0 transition-opacity duration-200 opacity-100">
                          <div className="flex-1" />
                          <div className="flex items-center gap-2">
                            <Actions>
                              <Action
                                onClick={() => copyMessage(message)}
                                tooltip="Copy message"
                                label="Copy"
                              >
                                <CopyIcon className="size-3" />
                              </Action>
                              <Action
                                onClick={() => customHandleEditMessage(message.id)}
                                tooltip="Edit message"
                                label="Edit"
                              >
                                <EditIcon className="size-3" />
                              </Action>
                            </Actions>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
                
                {/* Loading indicators - show after user messages until assistant content appears */}
                {message.role === 'user' && messageIndex === messages.length - 1 && !hasAssistantContentStarted() && (
                  <>
                    {/* AI Thinking Indicator */}
                    {status === 'thinking' && (
                      <div className="my-4">
                        <div className="flex items-center gap-2 text-gray-500">
                          <span className="text-lg font-mono">&lt;/&gt;</span>
                          <div className="relative overflow-hidden">
                            <span className="text-sm">AI is thinking...</span>
                            <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full h-full animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Tool Execution Indicator */}
                    {status === 'calling-tool' && (
                      <div className="my-4">
                        <div className="flex items-center gap-2 text-blue-500">
                          <span className="text-lg font-mono">&lt;/&gt;</span>
                          <div className="relative overflow-hidden">
                            <span className="text-sm">Running tools...</span>
                            <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-blue-200/50 to-transparent w-full h-full animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Query Generation Indicator - show until content actually appears */}
                    {(status === 'responding' || (status === 'idle' && !hasAssistantContentStarted())) && (
                      <div className="my-4">
                        <div className="flex items-center gap-2 text-green-500">
                          <span className="text-lg font-mono">&lt;/&gt;</span>
                          <div className="relative overflow-hidden">
                            <span className="text-sm">Generating query...</span>
                            <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-green-200/50 to-transparent w-full h-full animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

              </div>
            ))}
      
          </ConversationContent>
          
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Input Area - Use ResponsivePromptInput with stable props to prevent flickering */}
      <div className="border-t border-gray-200 bg-white p-3">
        <ResponsivePromptInput
          key={`chat-input-${threadId}`} // Stable key prevents re-mounting
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          placeholder="Ask me anything..."
          disabled={status !== 'idle'}
          status={inputStatus}
          className="w-full"
        />
      </div>
    </div>
  );
}
