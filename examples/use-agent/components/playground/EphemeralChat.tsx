"use client";

import { useChat } from '@/hooks';
import { useEphemeralThreads } from '@/hooks/use-ephemeral-threads';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Conversation, 
  ConversationContent, 
  ConversationScrollButton 
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { MessagePart } from '@/components/chat/message-parts';
import { MessageTitle } from '@/components/chat/message';
import { ResponsivePromptInput } from '@/components/ai-elements/prompt-input';
import { SqlToolPart } from './SqlToolPart';

interface EphemeralChatProps {
  threadId: string;
  storageType: 'session' | 'local';
  userId: string;
  currentSql: string; // Current SQL query for context
  tabTitle: string; // Tab title for context
  onSqlChange: (sql: string) => void; // NEW: Callback to update SQL in editor
}

export function EphemeralChat({ threadId, storageType, userId, currentSql, tabTitle, onSqlChange }: EphemeralChatProps) {

  const { fetchThreads, createThread, deleteThread, fetchHistory } = useEphemeralThreads({ userId, storageType });

  const { 
    messages, 
    sendMessage, 
    status, 
    currentThreadId, 
    setCurrentThreadId,
    clearThreadMessages 
  } = useChat({
    initialThreadId: threadId,
    userId,
    // Disable thread validation for ephemeral persistence layers
    // Ephemeral threads don't exist in a traditional database, so validation would always fail
    enableThreadValidation: false,
    // Pass current SQL query as state for AI context
    state: () => ({
      sqlQuery: currentSql,
      tabTitle,
      storageType,
      mode: 'sql_playground',
      timestamp: Date.now(),
    }),
    fetchThreads,
    createThread,
    deleteThread,
    fetchHistory,
  });
  
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
  }, [threadId]);

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
      {/* Chat Header - Clean and minimal with clear chat button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm font-medium text-gray-700">AI Assistant</span>
          <span className="text-xs text-gray-400">({storageType})</span>
        </div>
        <button
          onClick={handleClearChat}
          disabled={messages.length === 0 || status !== 'idle'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear chat messages"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear
        </button>
      </div>

      {/* Messages Area - Use proper Conversation components for scrolling */}
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <Conversation className="flex-1 min-h-0 bg-white">
          <ConversationContent className="p-4">
            {messages.map((message) => (
              <Message
                key={message.id}
                from={message.role}
                className={`flex-col ${message.role === 'assistant' ? 'items-start' : 'items-end'}`}
              >
                {/* Assistant messages get a title header */}
                {message.role === 'assistant' && (
                  <MessageTitle currentAgent="SQL Assistant" />
                )}
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
