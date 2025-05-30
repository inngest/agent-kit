"use client";

import React from 'react';
import { ThemeToggle } from '../theme-toggle';

interface ChatHeaderProps {
  onNewChat: () => void;
  onShareChat: () => void;
  onViewConversations: () => void;
  onViewProfile: () => void;
}

export function ChatHeader({
  onNewChat,
  onShareChat,
  onViewConversations,
  onViewProfile
}: ChatHeaderProps) {
  return (
    <header className="border-b border-gray-200 dark:border-zinc-700 py-3 px-4 flex justify-between items-center bg-white dark:bg-zinc-900">
      <div className="text-lg font-medium dark:text-white">AgentKit</div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <button 
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-300"
          onClick={onNewChat}
          title="New chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus">
            <path d="M5 12h14"/>
            <path d="M12 5v14"/>
          </svg>
        </button>
        {/* <button 
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-300"
          onClick={onShareChat}
          title="Share chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-share">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </button> */}
        <button 
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-300"
          onClick={onViewConversations}
          title="View conversations"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-list">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </button>
        {/* <button 
          className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700 h-9 w-9 flex items-center justify-center dark:text-zinc-300"
          onClick={onViewProfile}
          title="Profile"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </button> */}
      </div>
    </header>
  );
} 