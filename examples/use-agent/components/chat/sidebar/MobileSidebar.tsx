'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DesktopSidebar } from './DesktopSidebar';
import type { Thread } from '@inngest/use-agent';

interface MobileSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat: () => void;
  onSearchChat: () => void;
  onThreadSelect?: (threadId: string) => void;
  currentThreadId?: string | null;
  
  // NEW: Thread data passed from parent  
  threads?: Thread[];
  loading?: boolean;
  hasMore?: boolean;
  error?: string | null;
  onLoadMore?: () => Promise<void>;
  onDeleteThread?: (threadId: string) => Promise<void>;
}

export function MobileSidebar({
  isOpen,
  onOpenChange,
  onNewChat,
  onSearchChat,
  onThreadSelect,
  currentThreadId,
  threads,
  loading,
  hasMore,
  error,
  onLoadMore,
  onDeleteThread
}: MobileSidebarProps) {
  const handleNewChat = () => {
    onOpenChange(false);
    onNewChat();
  };

  const handleSearchChat = () => {
    onOpenChange(false);
    onSearchChat();
  };

  const handleToggle = () => {
    onOpenChange(false);
  };

  const handleThreadSelect = (threadId: string) => {
    onOpenChange(false); // Close mobile sidebar when thread is selected
    onThreadSelect?.(threadId);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-3/5 max-[480px]:w-4/5 max-[400px]:w-full sm:max-w-sm">
        <SheetHeader className="sr-only">
          <SheetTitle>Sidebar</SheetTitle>
        </SheetHeader>
        <DesktopSidebar
          isMinimized={false}
          onToggle={handleToggle}
          onNewChat={handleNewChat}
          onSearchChat={handleSearchChat}
          onThreadSelect={handleThreadSelect}
          currentThreadId={currentThreadId}
          threads={threads}
          loading={loading}
          hasMore={hasMore}
          error={error}
          onLoadMore={onLoadMore}
          onDeleteThread={onDeleteThread}
          className="w-full"
          hideToggleButton
        />
      </SheetContent>
    </Sheet>
  );
}

export default MobileSidebar;
