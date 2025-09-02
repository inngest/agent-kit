/**
 * A simple React hook for managing message editing UI state.
 * 
 * This hook provides the basic state management needed for editing messages
 * in a chat interface. It tracks which message is being edited and manages
 * the edit form state.
 * 
 * @fileoverview Simple message editing state management hook
 */

import { useState } from 'react';

/**
 * Configuration options for the useEditMessage hook.
 * 
 * @interface UseEditMessageOptions
 */
interface UseEditMessageOptions {
  /** Function to call when saving an edited message */
  sendMessage: (message: string) => void;
}

/**
 * A React hook for managing message editing UI state and interactions.
 * 
 * This hook provides the essential state management for implementing message editing
 * in chat interfaces. It handles the editing flow from initiation to completion,
 * managing form state and providing action handlers for the UI.
 * 
 * ## Features
 * 
 * - **Edit State Management**: Tracks which message is currently being edited
 * - **Form State**: Manages the edit textarea value
 * - **Text Extraction**: Automatically extracts text content from message parts
 * - **Save/Cancel Actions**: Provides handlers for completing or aborting edits
 * 
 * ## Integration
 * 
 * This hook is designed to work with message editing UIs and can be combined
 * with useConversationBranching for advanced editing workflows that create
 * alternate conversation paths.
 * 
 * @param options - Configuration for message editing
 * @param options.sendMessage - Function to call when saving edited content
 * 
 * @returns Object with editing state and action handlers
 * 
 * @example
 * ```typescript
 * function ChatMessage({ message, onSendMessage }) {
 *   const {
 *     editingMessage,
 *     editValue,
 *     setEditValue,
 *     handleEditMessage,
 *     handleSaveEdit,
 *     handleCancelEdit
 *   } = useEditMessage({ 
 *     sendMessage: onSendMessage 
 *   });
 *   
 *   if (editingMessage === message.id) {
 *     return (
 *       <form onSubmit={(e) => {
 *         e.preventDefault();
 *         handleSaveEdit(message.id);
 *       }}>
 *         <textarea
 *           value={editValue}
 *           onChange={(e) => setEditValue(e.target.value)}
 *           autoFocus
 *         />
 *         <button type="submit">Save</button>
 *         <button type="button" onClick={handleCancelEdit}>
 *           Cancel
 *         </button>
 *       </form>
 *     );
 *   }
 *   
 *   return (
 *     <div>
 *       <MessageContent message={message} />
 *       <button onClick={() => handleEditMessage(message)}>
 *         Edit
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useEditMessage({ sendMessage }: UseEditMessageOptions) {
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

  return {
    editingMessage,
    editValue,
    setEditValue,
    handleEditMessage,
    handleSaveEdit,
    handleCancelEdit,
  };
}
