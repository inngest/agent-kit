"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Tabs } from './Tabs';
import { SqlEditor } from './SqlEditor';
import { EphemeralChat } from './EphemeralChat';
import { useEphemeralThreads } from '@/hooks/use-ephemeral-threads';
import { Toaster } from '@/components/ui/sonner';

type Tab = {
  id: string;
  title: string;
  sql: string;
  sqlResult?: string;
  threadId: string;
};

export function SqlPlayground() {
  // Generate a stable, anonymous user ID for the session
  const [userId] = useState(() => `anonymous-user-${uuidv4()}`);
  const [storageType, setStorageType] = useState<'session' | 'local'>('session');

  // Initialize with a first tab to prevent empty state issues
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const firstThreadId = uuidv4();
    return [{
      id: `tab-${firstThreadId}`,
      title: 'Query 1',
      sql: 'SELECT * FROM users;',
      threadId: firstThreadId,
    }];
  });

  const [activeTabId, setActiveTabId] = useState<string | null>(() => tabs[0]?.id || null);

  const ephemeralThreads = useEphemeralThreads({ userId, storageType });

  const activeTab = useMemo(() => tabs.find(tab => tab.id === activeTabId), [tabs, activeTabId]);

  const addTab = useCallback(() => {
    const newThreadId = uuidv4();
    const newTab: Tab = {
      id: `tab-${newThreadId}`,
      title: `Query ${tabs.length + 1}`,
      sql: 'SELECT * FROM users;',
      threadId: newThreadId,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs.length]);
  
  const closeTab = (tabId: string) => {
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    setTabs(tabs.filter(tab => tab.id !== tabId));
    if (activeTabId === tabId) {
      const newActiveTab = tabs[tabIndex - 1] || tabs[tabIndex + 1];
      setActiveTabId(newActiveTab?.id || null);
    }
  };

  const updateSql = (sql: string) => {
    if (activeTab) {
      const newTabs = tabs.map(tab =>
        tab.id === activeTabId ? { ...tab, sql } : tab
      );
      setTabs(newTabs);
    }
  };

  return (
    <div className="flex h-screen bg-white">
      <Toaster position="bottom-right" richColors duration={3000} />
      <div className="flex flex-col w-full">
        {/* Tab Bar - Clean styling to match the image */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white">
          <Tabs
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={setActiveTabId}
            onCloseTab={closeTab}
            onNewTab={addTab}
          />
          
          {/* Controls in the tab bar area */}
          <div className="flex items-center gap-3 px-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Storage:</label>
              <select 
                value={storageType} 
                onChange={(e) => setStorageType(e.target.value as 'session' | 'local')}
                className="px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="session">Session</option>
                <option value="local">Local</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Main Content Area - Clean layout matching the image */}
        <div className="flex flex-1 min-h-0">
          {/* SQL Editor Section (3/4 width) */}
          <div className="flex-1 flex flex-col min-h-0">
            {activeTab ? (
              <SqlEditor sql={activeTab.sql} onSqlChange={updateSql} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 bg-white">
                <div className="text-center">
                  <div className="text-sm font-medium mb-1">No tab selected</div>
                  <div className="text-xs text-gray-400">Click the + button to create a new query</div>
                </div>
              </div>
            )}
          </div>
          
          {/* Chat Section - Increased width to prevent responsive flickering */}
          <div className="w-96 flex flex-col min-w-96">
            {activeTab ? (
              <EphemeralChat 
                threadId={activeTab.threadId} 
                storageType={storageType} 
                userId={userId}
                currentSql={activeTab.sql}
                tabTitle={activeTab.title}
                onSqlChange={updateSql}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 bg-white border-l border-gray-200">
                <div className="text-center p-4">
                  <div className="text-sm font-medium mb-1">No active chat</div>
                  <div className="text-xs text-gray-400">Select a tab to start chatting</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
