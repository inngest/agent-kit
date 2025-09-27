"use client";

import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SubChat } from '@/components/multi-chat/SubChat';
import { MultiChatHeader } from '@/components/multi-chat/MultiChatHeader';

export interface SubChatData {
  id: string;
  threadId: string;
  title: string;
  createdAt: Date;
}

export default function MultiChatPage() {
  const [subchats, setSubchats] = useState<SubChatData[]>([]);

  // Initialize first subchat on client-side to avoid hydration mismatch
  useEffect(() => {
    if (subchats.length === 0) {
      setSubchats([{
        id: uuidv4(),
        threadId: uuidv4(),
        title: "Chat 1", 
        createdAt: new Date(),
      }]);
    }
  }, [subchats.length]);

  const handleCreateSubchat = useCallback(() => {
    const newSubchat: SubChatData = {
      id: uuidv4(),
      threadId: uuidv4(), // ✅ Use proper UUID for database compatibility
      title: `Chat ${subchats.length + 1}`,
      createdAt: new Date(),
    };
    
    setSubchats(prev => [...prev, newSubchat]);
  }, [subchats.length]);

  const handleCloseSubchat = useCallback((subchatId: string) => {
    setSubchats(prev => prev.filter(chat => chat.id !== subchatId));
  }, []);

  const handleRenameSubchat = useCallback((subchatId: string, newTitle: string) => {
    setSubchats(prev => 
      prev.map(chat => 
        chat.id === subchatId 
          ? { ...chat, title: newTitle }
          : chat
      )
    );
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <MultiChatHeader 
        subchatCount={subchats.length}
        onCreateSubchat={handleCreateSubchat}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {subchats.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">No active chats</h2>
              <p className="text-muted-foreground mb-4">
                Create a subchat to start a new conversation
              </p>
              <button
                onClick={handleCreateSubchat}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                Create First Chat
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 grid gap-2 p-2 overflow-hidden" 
               style={{
                 gridTemplateColumns: subchats.length === 1 
                   ? '1fr' 
                   : subchats.length === 2 
                   ? '1fr 1fr' 
                   : 'repeat(auto-fit, minmax(400px, 1fr))'
               }}>
            {subchats.map((subchat) => (
              <SubChat
                key={subchat.id}
                subchat={subchat}
                onClose={handleCloseSubchat}
                onRename={handleRenameSubchat}
                showCloseButton={subchats.length > 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
