'use client';

import { useState, useEffect } from 'react';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SearchCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Mock recent searches
const mockRecentSearches = [
  { id: '1', query: 'billing question about subscription' },
  { id: '2', query: 'customer refund inquiry' },
  { id: '3', query: 'API rate limiting issues' },
  { id: '4', query: 'password reset not working' },
  { id: '5', query: 'webhook configuration help' },
];

export function SearchCommandMenu({
  open,
  onOpenChange,
}: SearchCommandMenuProps) {
  const [recentSearches, setRecentSearches] = useState(mockRecentSearches);

  // Keyboard shortcut support
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === 'k') {
        event.preventDefault();
        onOpenChange(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange]);

  const handleDeleteSearch = (searchId: string) => {
    setRecentSearches(prev => prev.filter(search => search.id !== searchId));
  };

  return (
    <CommandDialog 
      open={open} 
      onOpenChange={onOpenChange}
      title="Search Chats"
      description="Search through your chat history or access quick actions"
    >
      <CommandInput placeholder="Search chats..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        {/* Recent searches section */}
        <CommandGroup heading="Recent">
          {recentSearches.map((search) => (
            <div key={search.id} className="group relative">
              <CommandItem
                className="pr-8"
                onSelect={() => console.log('Selected search:', search.query)}
              >
                <span>{search.query}</span>
              </CommandItem>
              {/* Delete button - visible on hover */}
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSearch(search.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
