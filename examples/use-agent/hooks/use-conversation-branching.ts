import { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { type ConversationMessage } from './types';
import { formatMessagesToAgentKitHistory } from './utils/message-formatting';

interface ConversationBranch {
  id: string;
  parentMessageId?: string;  // Which message this branches from
  messages: ConversationMessage[];
  createdAt: Date;
  title?: string;  // Optional branch description
}

interface BranchedThread {
  threadId: string;
  mainBranch: ConversationBranch;
  branches: ConversationBranch[];
  activeBranchId: string;
  branchHistory: string[];  // Navigation history for back/forward
}

interface UseConversationBranchingOptions {
  userId: string;
  storageType?: 'session' | 'local';
}

export function useConversationBranching({
  userId,
  storageType = 'session'
}: UseConversationBranchingOptions) {
  const cacheKey = `conversation_branches_${userId}`;
  const storage = typeof window !== 'undefined' 
    ? (storageType === 'local' ? localStorage : sessionStorage)
    : null;

  const [branchedThreads, setBranchedThreads] = useState<Map<string, BranchedThread>>(new Map());

  // Load from storage on mount
  const loadFromStorage = useCallback(() => {
    if (!storage) return;
    try {
      const cached = storage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const map = new Map<string, BranchedThread>();
        Object.entries(parsed).forEach(([threadId, data]: [string, any]) => {
          map.set(threadId, {
            ...data,
            mainBranch: {
              ...data.mainBranch,
              createdAt: new Date(data.mainBranch.createdAt),
              messages: data.mainBranch.messages.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp)
              }))
            },
            branches: data.branches.map((b: any) => ({
              ...b,
              createdAt: new Date(b.createdAt),
              messages: b.messages.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp)
              }))
            }))
          });
        });
        setBranchedThreads(map);
      }
    } catch (e) {
      console.error(`Failed to load branches from ${storageType}Storage`, e);
    }
  }, [storage, cacheKey, storageType]);

  // Save to storage
  const saveToStorage = useCallback((threads: Map<string, BranchedThread>) => {
    if (!storage) return;
    try {
      const serializable = Object.fromEntries(threads.entries());
      storage.setItem(cacheKey, JSON.stringify(serializable));
    } catch (e) {
      console.error(`Failed to save branches to ${storageType}Storage`, e);
    }
  }, [storage, cacheKey, storageType]);

  // Get or create branched thread
  const getOrCreateBranchedThread = useCallback((threadId: string): BranchedThread => {
    let branchedThread = branchedThreads.get(threadId);
    if (!branchedThread) {
      branchedThread = {
        threadId,
        mainBranch: {
          id: 'main',
          messages: [],
          createdAt: new Date(),
          title: 'Main conversation'
        },
        branches: [],
        activeBranchId: 'main',
        branchHistory: ['main']
      };
    }
    return branchedThread;
  }, [branchedThreads]);

  // Create branch from a specific message
  const createBranchFromMessage = useCallback((threadId: string, messageId: string, currentMessages: ConversationMessage[]): { branchId: string; branchMessages: ConversationMessage[] } => {
    const branchedThread = getOrCreateBranchedThread(threadId);
    
    // Use the current messages from useChat as source of truth, not our internal state
    const branchPointIndex = currentMessages.findIndex(m => m.id === messageId);
    if (branchPointIndex === -1) {
      throw new Error(`Message ${messageId} not found in current conversation`);
    }

    // Create new branch with messages up to (but NOT including) the branch point
    // When editing a message, we want the history BEFORE that message, not including it
    const newBranchId = `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBranch: ConversationBranch = {
      id: newBranchId,
      parentMessageId: messageId,
      messages: currentMessages.slice(0, branchPointIndex), // Exclude the message we're editing
      createdAt: new Date(),
      title: `Edit from message ${branchPointIndex + 1}`
    };

    const updatedBranchedThread: BranchedThread = {
      ...branchedThread,
      branches: [...branchedThread.branches, newBranch],
      activeBranchId: newBranchId,
      branchHistory: [...branchedThread.branchHistory, newBranchId]
    };

    const updatedThreads = new Map(branchedThreads);
    updatedThreads.set(threadId, updatedBranchedThread);
    setBranchedThreads(updatedThreads);
    saveToStorage(updatedThreads);

    console.log('[AK_TELEMETRY] ConversationBranching.createBranch', {
      threadId,
      newBranchId,
      branchPointMessageId: messageId,
      branchPointIndex,
      messagesInBranch: newBranch.messages.length,
      totalBranches: updatedBranchedThread.branches.length
    });

    return { branchId: newBranchId, branchMessages: newBranch.messages };
  }, [branchedThreads, getOrCreateBranchedThread, saveToStorage]);

  // Switch to a specific branch
  const switchToBranch = useCallback((threadId: string, branchId: string): ConversationMessage[] => {
    const branchedThread = getOrCreateBranchedThread(threadId);
    const targetBranch = branchId === 'main' 
      ? branchedThread.mainBranch 
      : branchedThread.branches.find(b => b.id === branchId);
    
    if (!targetBranch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    const updatedBranchedThread: BranchedThread = {
      ...branchedThread,
      activeBranchId: branchId,
      branchHistory: [...branchedThread.branchHistory.filter(id => id !== branchId), branchId] // Move to end
    };

    const updatedThreads = new Map(branchedThreads);
    updatedThreads.set(threadId, updatedBranchedThread);
    setBranchedThreads(updatedThreads);
    saveToStorage(updatedThreads);

    return targetBranch.messages;
  }, [branchedThreads, getOrCreateBranchedThread, saveToStorage]);

  // Add message to current branch
  const addMessageToBranch = useCallback((threadId: string, message: ConversationMessage): void => {
    const branchedThread = getOrCreateBranchedThread(threadId);
    const activeBranch = branchedThread.branches.find(b => b.id === branchedThread.activeBranchId) || branchedThread.mainBranch;
    
    const updatedBranch: ConversationBranch = {
      ...activeBranch,
      messages: [...activeBranch.messages, message]
    };

    const updatedBranchedThread: BranchedThread = {
      ...branchedThread,
      ...(branchedThread.activeBranchId === 'main' 
        ? { mainBranch: updatedBranch }
        : { branches: branchedThread.branches.map(b => b.id === branchedThread.activeBranchId ? updatedBranch : b) }
      )
    };

    const updatedThreads = new Map(branchedThreads);
    updatedThreads.set(threadId, updatedBranchedThread);
    setBranchedThreads(updatedThreads);
    saveToStorage(updatedThreads);
  }, [branchedThreads, getOrCreateBranchedThread, saveToStorage]);

  // Get current branch messages
  const getCurrentBranchMessages = useCallback((threadId: string): ConversationMessage[] => {
    const branchedThread = branchedThreads.get(threadId);
    if (!branchedThread) return [];
    
    const activeBranch = branchedThread.branches.find(b => b.id === branchedThread.activeBranchId) || branchedThread.mainBranch;
    return activeBranch.messages;
  }, [branchedThreads]);

  // Clear all branches for a thread
  const clearAllBranches = useCallback((threadId: string): void => {
    const updatedThreads = new Map(branchedThreads);
    updatedThreads.delete(threadId);
    setBranchedThreads(updatedThreads);
    saveToStorage(updatedThreads);
  }, [branchedThreads, saveToStorage]);

  // Get branch info for UI
  const getBranchInfo = useCallback((threadId: string) => {
    const branchedThread = branchedThreads.get(threadId);
    if (!branchedThread) {
      return {
        activeBranchId: 'main',
        totalBranches: 0,
        canGoBack: false,
        canGoForward: false,
        branches: []
      };
    }

    const currentIndex = branchedThread.branchHistory.indexOf(branchedThread.activeBranchId);
    return {
      activeBranchId: branchedThread.activeBranchId,
      totalBranches: branchedThread.branches.length + 1, // +1 for main branch
      canGoBack: currentIndex > 0,
      canGoForward: currentIndex < branchedThread.branchHistory.length - 1,
      branches: [branchedThread.mainBranch, ...branchedThread.branches]
    };
  }, [branchedThreads]);

  // Navigation
  const goBack = useCallback((threadId: string): ConversationMessage[] | null => {
    const branchedThread = branchedThreads.get(threadId);
    if (!branchedThread) return null;

    const currentIndex = branchedThread.branchHistory.indexOf(branchedThread.activeBranchId);
    if (currentIndex <= 0) return null;

    const previousBranchId = branchedThread.branchHistory[currentIndex - 1];
    return switchToBranch(threadId, previousBranchId);
  }, [branchedThreads, switchToBranch]);

  const goForward = useCallback((threadId: string): ConversationMessage[] | null => {
    const branchedThread = branchedThreads.get(threadId);
    if (!branchedThread) return null;

    const currentIndex = branchedThread.branchHistory.indexOf(branchedThread.activeBranchId);
    if (currentIndex >= branchedThread.branchHistory.length - 1) return null;

    const nextBranchId = branchedThread.branchHistory[currentIndex + 1];
    return switchToBranch(threadId, nextBranchId);
  }, [branchedThreads, switchToBranch]);

  // Get the correct conversation history for the current branch
  const getBranchHistory = useCallback((threadId: string): ConversationMessage[] => {
    const branchedThread = branchedThreads.get(threadId);
    if (!branchedThread) return [];
    
    const activeBranch = branchedThread.branches.find(b => b.id === branchedThread.activeBranchId) || branchedThread.mainBranch;
    return activeBranch.messages;
  }, [branchedThreads]);

  // Custom sendMessage that handles branching
  const branchingSendMessage = useCallback(async (
    originalSendMessage: (message: string, options?: { messageId?: string }) => Promise<void>,
    sendMessageToThread: (threadId: string, message: string, options?: { 
      messageId?: string; 
      state?: Record<string, unknown> | (() => Record<string, unknown>);
    }) => Promise<void>,
    replaceMessages: (threadId: string, messages: ConversationMessage[]) => void, // NEW: UI update callback
    threadId: string,
    message: string, 
    currentMessages: ConversationMessage[], // Pass current messages for sync
    options?: { 
      messageId?: string;
      editFromMessageId?: string;  // Edit branching parameter
    }
  ) => {
    if (options?.editFromMessageId) {
      // Create new branch from edit point using current messages as source of truth
      const { branchId: newBranchId, branchMessages } = createBranchFromMessage(threadId, options.editFromMessageId, currentMessages);
      
      // Use the branch messages directly (no async state dependency)
      const branchHistory = branchMessages;
      
      console.log('[AK_TELEMETRY] ConversationBranching.editAndSend', {
        threadId,
        editFromMessageId: options.editFromMessageId,
        newBranchId,
        newMessage: message.substring(0, 50) + '...',
        branchHistoryLength: branchHistory.length,
        originalMessageCount: currentMessages.length
      });
      
      // Find the original message being edited to get its client state
      const originalMessage = currentMessages.find(m => m.id === options.editFromMessageId);
      const originalClientState = originalMessage?.clientState || {};
      const editIndex = currentMessages.findIndex(m => m.id === options.editFromMessageId);
      
      // CRITICAL: Clear the conversation from the edit point before sending
      // This prevents duplicate messages by truncating the conversation
      if (editIndex !== -1) {
        const messagesBeforeEdit = currentMessages.slice(0, editIndex);
        replaceMessages(threadId, messagesBeforeEdit);
        
        console.log('[AK_TELEMETRY] ConversationBranching.truncateBeforeEdit', {
          editIndex,
          messagesBeforeEdit: messagesBeforeEdit.length,
          messagesRemoved: currentMessages.length - editIndex,
          editedMessageId: options.editFromMessageId
        });
      }
      
      // Send with proper branch-specific history context and original client state
      await sendMessageToThread(threadId, message, {
        messageId: options?.messageId,
        // Override the state to include correct conversation history AND original client state
        state: () => {
          // Use the enhanced formatMessagesToAgentKitHistory that includes tool calls/results
          const formattedHistory = formatMessagesToAgentKitHistory(branchHistory);
          
          // Merge original client state with branching metadata
          return {
            ...originalClientState, // ✅ Use original message's client state!
            branchId: newBranchId,
            branchHistory: formattedHistory,
            editFromMessageId: options.editFromMessageId,
            mode: 'conversation_branching',
            timestamp: Date.now(),
          };
        }
      });
      
      return; // Exit early - we handled the message sending
    }
    
    // Send message normally for non-edit scenarios
    await originalSendMessage(message, { messageId: options?.messageId });
  }, [createBranchFromMessage, getBranchHistory]);

  // Custom replaceMessages that works with branching
  const branchingReplaceMessages = useCallback((threadId: string, messages: ConversationMessage[]) => {
    const branchedThread = getOrCreateBranchedThread(threadId);
    const activeBranch = branchedThread.branches.find(b => b.id === branchedThread.activeBranchId) || branchedThread.mainBranch;
    
    const updatedBranch: ConversationBranch = {
      ...activeBranch,
      messages: messages
    };

    const updatedBranchedThread: BranchedThread = {
      ...branchedThread,
      ...(branchedThread.activeBranchId === 'main' 
        ? { mainBranch: updatedBranch }
        : { branches: branchedThread.branches.map(b => b.id === branchedThread.activeBranchId ? updatedBranch : b) }
      )
    };

    const updatedThreads = new Map(branchedThreads);
    updatedThreads.set(threadId, updatedBranchedThread);
    setBranchedThreads(updatedThreads);
    saveToStorage(updatedThreads);
  }, [branchedThreads, getOrCreateBranchedThread, saveToStorage]);

  // Custom clearMessages that clears current branch
  const branchingClearMessages = useCallback((threadId: string) => {
    branchingReplaceMessages(threadId, []);
  }, [branchingReplaceMessages]);

  return {
    // Core branching functionality
    createBranchFromMessage,
    switchToBranch,
    getCurrentBranchMessages,
    addMessageToBranch,
    clearAllBranches,
    
    // Navigation
    getBranchInfo,
    goBack,
    goForward,
    
    // Drop-in replacements for useChat functions
    sendMessage: branchingSendMessage,
    replaceMessages: branchingReplaceMessages,
    clearMessages: branchingClearMessages,
    
    // State
    loadFromStorage,
  };
}
