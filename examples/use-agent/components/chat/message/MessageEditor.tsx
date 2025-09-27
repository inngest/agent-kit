import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface MessageEditorProps {
  messageId: string;
  value: string;
  onChange: (value: string) => void;
  onSave: (messageId: string) => void;
  onCancel: () => void;
}

export function MessageEditor({ messageId, value, onChange, onSave, onCancel }: MessageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autofocus and select all text when entering edit mode
  useEffect(() => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      // Defer to after paint
      setTimeout(() => {
        try {
          el.focus();
          el.setSelectionRange(0, el.value.length);
        } catch {}
      }, 0);
    }
  }, []);

  return (
    <div className="rounded-2xl border bg-accent/40 dark:bg-input/30 px-4 py-3 mt-2 mb-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none bg-transparent outline-none ring-0 border-0 focus:outline-none focus:ring-0 text-sm"
        rows={Math.max(3, value.split('\n').length)}
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="sm" onClick={() => onSave(messageId)}>Send</Button>
      </div>
    </div>
  );
}

export default MessageEditor;