'use client';

import { ResponsivePromptInput } from '@/components/ai-elements/prompt-input';
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';

interface EmptyStateProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  status: 'idle' | 'thinking' | 'calling-tool' | 'responding' | 'error';
  isConnected: boolean;
  suggestions: string[];
  onSuggestionClick: (s: string) => void;
}

export function EmptyState({ value, onChange, onSubmit, status, isConnected, suggestions, onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-2xl mx-auto px-4 text-center space-y-4">
        <h2 className="text-xl md:text-2xl font-semibold text-gray-700">How can I help you today?</h2>
        <ResponsivePromptInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Ask anything"
          disabled={status !== 'idle'}
          status={
            status === 'thinking' ? 'submitted' :
            status === 'responding' ? 'streaming' :
            status === 'error' ? 'error' :
            undefined
          }
          className="mx-auto"
        />
        <Suggestions className="mx-auto">
          {suggestions.map((s, i) => (
            <Suggestion key={i} suggestion={s} onClick={onSuggestionClick} />
          ))}
        </Suggestions>
      </div>
    </div>
  );
}

export default EmptyState;


