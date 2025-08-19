"use client";

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PlusIcon, Trash2Icon, ShareIcon, ChevronDownIcon, MenuIcon, SearchIcon, CheckIcon } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

type HeaderProps = {
  onNewChat: () => void;
  onDelete: () => void;
  onShare: () => void;
  onOpenMobileSidebar?: () => void;
} & HTMLAttributes<HTMLDivElement>;

// Visible on mobile/tablet; hidden on xl and above. Positioned at the top of the chat area.
export function ChatHeader({ onNewChat, onDelete, onShare, onOpenMobileSidebar, className, ...props }: HeaderProps) {
  const recentAgents = [
    { name: 'Customer Support Network', description: 'Handles customer inquiries and returns', selected: true },
    { name: 'Docs QA Agent', description: 'Answers questions from internal docs', selected: false },
    { name: 'Billing Agent', description: 'Assists with invoices and subscriptions', selected: false },
    { name: 'DevOps Agent', description: 'Guides on on-call and deployment issues', selected: false },
  ];

  return (
    <div
      className={cn(
        // Visible up to lg, hidden on xl+. Positioned within chat area, not above sidebar.
        'xl:hidden absolute top-0 left-0 right-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className,
      )}
      {...props}
    >
      <div className="relative flex items-center justify-end px-3 py-2">
        {/* Hamburger menu (left), opens mobile sidebar sheet */}
        <div className="absolute left-2 md:hidden">
          <Button variant="ghost" size="icon" onClick={onOpenMobileSidebar} aria-label="Open menu">
            <MenuIcon className="h-5 w-5" />
          </Button>
        </div>
        {/* Brand trigger: centered on mobile, left-aligned on md+ */}
        <div className="absolute left-1/2 -translate-x-1/2 md:static md:transform-none md:translate-x-0 md:mr-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 px-2" aria-label="Open agent selector">
                <span className="text-base md:text-sm font-semibold">Customer Support Network</span>
                <ChevronDownIcon className="h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 p-0">
              <div className="p-2 relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search agents..."
                  className="pl-9 border-none focus-visible:ring-0 focus-visible:ring-offset-0 outline-none shadow-none"
                />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Recent</DropdownMenuLabel>
                {recentAgents.map((agent) => (
                  <DropdownMenuItem key={agent.name} onSelect={() => console.log('Select agent:', agent.name)} className="items-start">
                    <div className="flex flex-col mr-6">
                      <span className="text-sm font-medium">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">{agent.description}</span>
                    </div>
                    {agent.selected && (
                      <CheckIcon className="ml-auto h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onNewChat} aria-label="New chat">
            <PlusIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete conversation" className="hidden sm:inline-flex">
            <Trash2Icon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onShare} aria-label="Share conversation" className="hidden sm:inline-flex">
            <ShareIcon className="h-4 w-4 mr-1.5" />
            <span>Share</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// Hidden on small screens; visible on xl+ as absolute controls in the top-right of the chat area.
export function HeaderActions({ onNewChat, onDelete, onShare, className, ...props }: HeaderProps) {
  return (
    <div
      className={cn(
        'hidden xl:flex absolute top-2 right-2 z-30 items-center gap-2',
        className,
      )}
      {...props}
    >
      {/* Brand trigger on desktop as well (top-left of chat area). Kept visually hidden here since we only need top-right controls. */}
      <Button variant="ghost" size="icon" onClick={onNewChat} aria-label="New chat">
        <PlusIcon className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete conversation">
        <Trash2Icon className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onShare} aria-label="Share conversation">
        <ShareIcon className="h-4 w-4 mr-1.5" />
        <span>Share</span>
      </Button>
    </div>
  );
}


