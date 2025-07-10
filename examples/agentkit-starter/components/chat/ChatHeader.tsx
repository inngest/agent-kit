"use client";

import React from 'react';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '../theme-toggle';

interface ChatHeaderProps {
  onNewChat: () => void;
  onShareChat: () => void;
  onViewConversations: () => void;
  onViewProfile: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function ChatHeader({
  onNewChat,
  onShareChat,
  onViewConversations,
  onViewProfile,
  sidebarOpen = true,
  onToggleSidebar
}: ChatHeaderProps) {
  return (
    <header className="border-b border-gray-200 dark:border-zinc-700 py-3 px-4 flex justify-between items-center bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button 
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-300"
            onClick={onToggleSidebar}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="text-lg font-medium dark:text-white">AgentKit</div>
      </div>
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
      </div>
    </header>
  );
} 