import { useState } from 'react';

interface UseEditMessageOptions {
  sendMessage: (message: string) => void;
}

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
