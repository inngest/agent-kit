'use client';

import { useState, useEffect } from 'react';
import { 
  SearchIcon, 
  SettingsIcon, 
  HelpCircleIcon, 
  LifeBuoyIcon, 
  LogOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  ShareIcon,
  EditIcon,
  TrashIcon,
  UserIcon,
  CircleUserRoundIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SearchCommandMenu } from './SearchCommandMenu';
import { CommandShortcut } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DesktopSidebarProps {
  isMinimized: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSearchChat: () => void;
  className?: string;
  hideToggleButton?: boolean;
}

// Mock thread data
const mockThreads = [
  { id: '1', title: 'Customer refund inquiry' },
  { id: '2', title: 'Billing question about subscription' },
  { id: '3', title: 'Product support request' },
  { id: '4', title: 'Account setup help' },
  { id: '5', title: 'Integration documentation' },
  { id: '6', title: 'API rate limiting issues' },
  { id: '7', title: 'Password reset not working' },
  { id: '8', title: 'Feature request for dashboard' },
  { id: '9', title: 'Payment method update needed' },
  { id: '10', title: 'Data export functionality' },
  { id: '11', title: 'Mobile app sync problems' },
  { id: '12', title: 'Team member permissions' },
  { id: '13', title: 'Webhook configuration help' },
  { id: '14', title: 'Performance optimization question' },
  { id: '15', title: 'SSL certificate renewal' },
  { id: '16', title: 'Database backup restore' },
  { id: '17', title: 'Third-party integration setup' },
  { id: '18', title: 'User role management' },
  { id: '19', title: 'Analytics dashboard not loading' },
  { id: '20', title: 'Email notification settings' },
  { id: '21', title: 'Two-factor authentication setup' },
  { id: '22', title: 'Custom domain configuration' },
  { id: '23', title: 'Bulk data import guidance' },
  { id: '24', title: 'Enterprise license upgrade' },
  { id: '25', title: 'GDPR compliance questions' },
];

const mockUser = {
  email: 'twerbel@inngest.com',
  name: 'Ted Werbel',
  avatar: '/user-avatar.png'
};

interface ThreadCardProps {
  thread: typeof mockThreads[0];
  isMinimized: boolean;
  onSelect: (threadId: string) => void;
  onShare: (threadId: string) => void;
  onRename: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}

function ThreadCard({ thread, isMinimized, onSelect, onShare, onRename, onDelete }: ThreadCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  if (isMinimized) return null;

  return (
    <div
      className={cn(
        'w-full h-auto px-4 py-1.5 justify-start text-left font-normal relative transition-colors duration-200 cursor-pointer rounded-md',
        'hover:bg-[#EFEFEF] dark:hover:bg-gray-800',
        isHovered && 'bg-[#EFEFEF] dark:bg-gray-800'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(thread.id)}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-normal truncate text-gray-900 dark:text-gray-100">
            {thread.title}
          </h3>
        </div>
        
        {/* Thread actions popover - visible on hover */}
        <div className={cn(
          'transition-opacity duration-200',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontalIcon className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(thread.id);
                }}
              >
                <ShareIcon className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRename(thread.id);
                }}
              >
                <EditIcon className="h-4 w-4 mr-2" />
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(thread.id);
                }}
              >
                <TrashIcon className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className={className}>
      <path d="M1.34775 22.4789C0.892609 22.4789 0.470701 22.1891 0.325848 21.7346C-0.435622 19.3498 0.129542 17.3541 2.10525 15.4537L10.1506 7.80622C11.379 6.62327 13.1117 6.32005 14.6735 7.01549C16.2288 7.70856 17.155 9.18765 17.094 10.8794V11.7016C17.094 12.2915 16.6135 12.7688 16.0215 12.7688C15.4294 12.7688 14.9489 12.2907 14.9489 11.7016V10.8589C14.9489 10.8439 14.9489 10.8298 14.9497 10.8156C14.9837 9.99256 14.5531 9.30027 13.7972 8.96397C13.0413 8.62767 12.2355 8.76865 11.6418 9.34201C11.6402 9.34359 11.6379 9.34595 11.6363 9.34753L3.59336 16.9926C2.22082 18.3134 1.86542 19.5018 2.37201 21.088C2.55169 21.6496 2.23902 22.2497 1.67465 22.4285C1.56621 22.4624 1.45697 22.4789 1.34931 22.4789H1.34775Z" fill="currentColor"></path>
      <path d="M19.0798 25.352C18.5115 25.352 17.9336 25.2307 17.378 24.9834C15.8226 24.2904 14.8965 22.8113 14.9574 21.1196V20.3028C14.9574 19.7129 15.4379 19.2357 16.03 19.2357C16.6221 19.2357 17.1025 19.7137 17.1025 20.3028V21.14C17.1025 21.155 17.1025 21.1692 17.1017 21.1841C17.0677 22.0072 17.4983 22.6994 18.2542 23.0357C19.0101 23.372 19.8159 23.2311 20.4096 22.6577L28.3963 15.0095C29.7942 13.6643 30.1512 12.4813 29.6264 10.9282C29.438 10.369 29.7396 9.76417 30.3016 9.57594C30.8636 9.38849 31.4715 9.68856 31.6607 10.2477C32.4483 12.579 31.8681 14.6393 29.8868 16.5461L21.9017 24.1927C21.1117 24.9551 20.1104 25.3528 19.0798 25.3528V25.352Z" fill="currentColor"></path>
      <path d="M5.54491 25.3323C4.91009 25.3323 4.27686 25.2181 3.67449 24.9826C3.61592 24.9598 3.55734 24.9362 3.49956 24.911C2.95498 24.6778 2.70405 24.0501 2.93835 23.5083C3.17264 22.9664 3.80351 22.7167 4.3481 22.9499C4.38451 22.9656 4.42091 22.9806 4.45732 22.9948C5.54095 23.4169 6.81456 23.1665 7.78341 22.3419C7.82932 22.3001 7.98051 22.1591 8.00109 22.1394L22.4358 8.46069C22.4358 8.46069 22.7461 8.16929 22.8133 8.11337C23.7949 7.29034 24.9094 6.79732 26.0365 6.68784C26.2756 6.66421 26.5178 6.65713 26.756 6.66579C27.2888 6.6839 27.8729 6.74061 28.5077 7.0328C29.0452 7.28089 29.2795 7.9149 29.0302 8.45045C28.7808 8.98522 28.1436 9.21835 27.6054 8.97026C27.3315 8.84425 27.0592 8.81195 26.68 8.79935C26.5344 8.79384 26.3895 8.79857 26.2455 8.81274C25.5553 8.87969 24.8508 9.19945 24.2065 9.73737C24.155 9.78383 23.9484 9.976 23.9152 10.0067L9.4805 23.6863C9.4805 23.6863 9.24382 23.9084 9.19158 23.9533C8.13644 24.8574 6.83751 25.3323 5.54491 25.3331V25.3323Z" fill="currentColor"></path>
    </svg>
  );
}

export function DesktopSidebar({ 
  isMinimized, 
  onToggle, 
  onNewChat, 
  onSearchChat, 
  className,
  hideToggleButton
}: DesktopSidebarProps) {
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [isSearchMenuOpen, setIsSearchMenuOpen] = useState(false);
  const [isSearchButtonHovered, setIsSearchButtonHovered] = useState(false);
  
  // Initialize minimized state from localStorage for desktop only
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isSmallScreen = window.matchMedia('(max-width: 767px)').matches;
    if (isSmallScreen) return; // Always start closed on mobile
    const stored = window.localStorage.getItem('useAgent.sidebarMinimized');
    if (stored !== null) {
      const shouldBeMinimized = stored === 'true';
      if (shouldBeMinimized !== isMinimized) {
        onToggle();
      }
    }
    // We only want to run this on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset hover state when minimized state changes
  useEffect(() => {
    setIsLogoHovered(false);
  }, [isMinimized]);
  const handleThreadSelect = (threadId: string) => {
    console.log('Select thread:', threadId);
    // TODO: Implement thread navigation
  };

  const handleThreadShare = (threadId: string) => {
    console.log('Share thread:', threadId);
    // TODO: Implement thread sharing
  };

  const handleThreadRename = (threadId: string) => {
    console.log('Rename thread:', threadId);
    // TODO: Implement thread renaming
  };

  const handleThreadDelete = (threadId: string) => {
    console.log('Delete thread:', threadId);
    // TODO: Implement thread deletion
  };

  const handleUserAction = (action: string) => {
    console.log('User action:', action);
    // TODO: Implement user actions (settings, help, support, logout)
  };

  const handleSearchChat = () => {
    setIsSearchMenuOpen(true);
  };

  const handleSettings = () => {
    handleUserAction('settings');
  };

  const handleProfile = () => {
    handleUserAction('profile');
  };

  return (
    <div className={cn(
      'relative flex flex-col h-full bg-[#F9F9F9] dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300',
      isMinimized ? 'w-14' : 'w-64',
      className
    )}>
      {/* Header with logo and toggle */}
      <div className={cn(
        "pt-2 px-3 pb-1",
        isMinimized 
          ? "flex items-center justify-center" 
          : "flex items-center justify-between"
      )}>
        {isMinimized ? (
          /* Logo with hover behavior for minimize mode - centered */
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-10 w-10 p-0 hover:bg-[#EFEFEF] dark:hover:bg-gray-800 transition-all duration-200 cursor-e-resize"
                onClick={onToggle}
                onMouseEnter={() => setIsLogoHovered(true)}
                onMouseLeave={() => setIsLogoHovered(false)}
              >
                <div className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                  isLogoHovered ? "opacity-0" : "opacity-100"
                )}>
                  <LogoIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                </div>
                <div className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                  isLogoHovered ? "opacity-100" : "opacity-0"
                )}>
                  <ChevronRightIcon className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-xs font-medium">Open sidebar</div>
            </TooltipContent>
          </Tooltip>
        ) : (
          /* Normal logo with app name and toggle button */
          <>
            <div className="flex items-center ml-1">
              <LogoIcon className="h-5 w-5 text-gray-500 dark:text-gray-300 ml-1" />
              <span className="ml-3 text-base text-nowrap font-light text-gray-900 dark:text-gray-100">
                {/* AgentKit */}
              </span>
            </div>
            
            {/* Toggle button only visible when maximized and not hidden (e.g., hide on mobile sheet) */}
            {!hideToggleButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 cursor-w-resize"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Main actions */}
      <div className="flex flex-col gap-1 px-2 pb-2">
        {/* New Chat */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={onNewChat}
              className={cn(
                'transition-all duration-200 hover:bg-[#EFEFEF] dark:hover:bg-gray-800 cursor-pointer',
                isMinimized 
                  ? 'w-10 h-10 p-0 justify-center mx-auto' 
                  : 'w-full h-auto justify-start px-6 py-2 font-normal'
              )}
            >
              <svg style={{ scale: 1.1, position: "relative", right: 1, bottom: 0.76 }} width="18" height="18" viewBox="0 0 18 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="opacity-75" aria-hidden="false" aria-label="New chat">
                <path d="M2.6687 11.333V8.66699C2.6687 7.74455 2.66841 7.01205 2.71655 6.42285C2.76533 5.82612 2.86699 5.31731 3.10425 4.85156L3.25854 4.57617C3.64272 3.94975 4.19392 3.43995 4.85229 3.10449L5.02905 3.02149C5.44666 2.84233 5.90133 2.75849 6.42358 2.71582C7.01272 2.66769 7.74445 2.66797 8.66675 2.66797H9.16675C9.53393 2.66797 9.83165 2.96586 9.83179 3.33301C9.83179 3.70028 9.53402 3.99805 9.16675 3.99805H8.66675C7.7226 3.99805 7.05438 3.99834 6.53198 4.04102C6.14611 4.07254 5.87277 4.12568 5.65601 4.20313L5.45581 4.28906C5.01645 4.51293 4.64872 4.85345 4.39233 5.27149L4.28979 5.45508C4.16388 5.7022 4.08381 6.01663 4.04175 6.53125C3.99906 7.05373 3.99878 7.7226 3.99878 8.66699V11.333C3.99878 12.2774 3.99906 12.9463 4.04175 13.4688C4.08381 13.9833 4.16389 14.2978 4.28979 14.5449L4.39233 14.7285C4.64871 15.1465 5.01648 15.4871 5.45581 15.7109L5.65601 15.7969C5.87276 15.8743 6.14614 15.9265 6.53198 15.958C7.05439 16.0007 7.72256 16.002 8.66675 16.002H11.3337C12.2779 16.002 12.9461 16.0007 13.4685 15.958C13.9829 15.916 14.2976 15.8367 14.5447 15.7109L14.7292 15.6074C15.147 15.3511 15.4879 14.9841 15.7117 14.5449L15.7976 14.3447C15.8751 14.128 15.9272 13.8546 15.9587 13.4688C16.0014 12.9463 16.0017 12.2774 16.0017 11.333V10.833C16.0018 10.466 16.2997 10.1681 16.6667 10.168C17.0339 10.168 17.3316 10.4659 17.3318 10.833V11.333C17.3318 12.2555 17.3331 12.9879 17.2849 13.5771C17.2422 14.0993 17.1584 14.5541 16.9792 14.9717L16.8962 15.1484C16.5609 15.8066 16.0507 16.3571 15.4246 16.7412L15.1492 16.8955C14.6833 17.1329 14.1739 17.2354 13.5769 17.2842C12.9878 17.3323 12.256 17.332 11.3337 17.332H8.66675C7.74446 17.332 7.01271 17.3323 6.42358 17.2842C5.90135 17.2415 5.44665 17.1577 5.02905 16.9785L4.85229 16.8955C4.19396 16.5601 3.64271 16.0502 3.25854 15.4238L3.10425 15.1484C2.86697 14.6827 2.76534 14.1739 2.71655 13.5771C2.66841 12.9879 2.6687 12.2555 2.6687 11.333ZM13.4646 3.11328C14.4201 2.334 15.8288 2.38969 16.7195 3.28027L16.8865 3.46485C17.6141 4.35685 17.6143 5.64423 16.8865 6.53613L16.7195 6.7207L11.6726 11.7686C11.1373 12.3039 10.4624 12.6746 9.72827 12.8408L9.41089 12.8994L7.59351 13.1582C7.38637 13.1877 7.17701 13.1187 7.02905 12.9707C6.88112 12.8227 6.81199 12.6134 6.84155 12.4063L7.10132 10.5898L7.15991 10.2715C7.3262 9.53749 7.69692 8.86241 8.23218 8.32715L13.2791 3.28027L13.4646 3.11328ZM15.7791 4.2207C15.3753 3.81702 14.7366 3.79124 14.3035 4.14453L14.2195 4.2207L9.17261 9.26856C8.81541 9.62578 8.56774 10.0756 8.45679 10.5654L8.41772 10.7773L8.28296 11.7158L9.22241 11.582L9.43433 11.543C9.92426 11.432 10.3749 11.1844 10.7322 10.8271L15.7791 5.78027L15.8552 5.69629C16.185 5.29194 16.1852 4.708 15.8552 4.30371L15.7791 4.2207Z"></path>
              </svg>
              {!isMinimized && <span className="ml-0">New chat</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={!isMinimized}>
            <div className="text-xs font-medium">New chat</div>
          </TooltipContent>
        </Tooltip>

        {/* Search Chat */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={handleSearchChat}
              onMouseEnter={() => setIsSearchButtonHovered(true)}
              onMouseLeave={() => setIsSearchButtonHovered(false)}
              className={cn(
                'transition-all duration-200 hover:bg-[#EFEFEF] dark:hover:bg-gray-800 relative cursor-pointer',
                isMinimized 
                  ? 'w-10 h-10 p-0 justify-center mx-auto' 
                  : 'w-full h-auto justify-start px-6 py-2 font-normal'
              )}
            >
              <SearchIcon className="h-5.5 w-5.5 opacity-75" />
              {!isMinimized && (
                <div className="flex items-center justify-between w-full">
                  <span className="ml-0">Search chats</span>
                  {/* Keyboard shortcut preview on hover */}
                  <div className={cn(
                    "transition-opacity duration-200",
                    isSearchButtonHovered ? "opacity-100" : "opacity-0"
                  )}>
                    <CommandShortcut className="text-sm opacity-80">⌘K</CommandShortcut>
                  </div>
                </div>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={!isMinimized}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">Search chats</span>
              <CommandShortcut className="text-xs text-white/65">⌘K</CommandShortcut>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Separator below main actions */}
      {!isMinimized && (

          <Separator className="mb-0 opacity-50" />

      )}

      {/* History section - scrollable area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {isMinimized ? (
          /* Clickable empty space when minimized */
          <div 
            className="flex-1 cursor-e-resize" 
            onClick={onToggle}
          />
        ) : (
          /* History section - only visible when maximized */
          <div className="flex-1 px-2 overflow-y-auto min-h-0">
            <div className="px-4 py-0 pt-4">
              <h2 className="text-sm font-normal text-gray-500 dark:text-gray-400 opacity-70">
                Chats
              </h2>
            </div>
            <div className="space-y-1 pb-2 pt-2">
              {mockThreads.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  isMinimized={isMinimized}
                  onSelect={handleThreadSelect}
                  onShare={handleThreadShare}
                  onRename={handleThreadRename}
                  onDelete={handleThreadDelete}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User avatar and menu at bottom */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'transition-all duration-200 font-normal hover:bg-[#EFEFEF] dark:hover:bg-gray-800',
                isMinimized 
                  ? 'w-10 h-10 p-0 justify-center mx-auto' 
                  : 'w-full h-auto justify-start px-2 py-1.5'
              )}
            >
              <div className="w-6.5 h-6.5 bg-blue-400 text-white rounded-full flex items-center justify-center text-xs font-medium">
                TW
              </div>
              {!isMinimized && (
                <div className="ml-0 flex-1 text-left">
                  <div className="text-sm font-normal text-gray-900 dark:text-gray-100">
                    {mockUser.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {mockUser.email}
                  </div>
                </div>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-1" align={isMinimized ? "center" : "start"} side="top">
            {/* User info at top */}

              <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-400 px-2.5 py-1.5">
                <CircleUserRoundIcon className="h-4 w-4 mr-1.5" />
                {mockUser.email}
              </div>

            
            {/* Menu items */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm font-normal"
              onClick={() => handleUserAction('settings')}
            >
              <SettingsIcon className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm font-normal"
              onClick={() => handleUserAction('help')}
            >
              <HelpCircleIcon className="h-4 w-4 mr-2" />
              Help
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm font-normal"
              onClick={() => handleUserAction('support')}
            >
              <LifeBuoyIcon className="h-4 w-4 mr-2" />
              Support
            </Button>
            <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm text-red-600 hover:text-red-700 hover:bg-red-50 font-normal"
                onClick={() => handleUserAction('logout')}
              >
                <LogOutIcon className="h-4 w-4 mr-2" />
                Log out
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Search Command Menu */}
      <SearchCommandMenu
        open={isSearchMenuOpen}
        onOpenChange={setIsSearchMenuOpen}
      />

      {/* Right-edge rail to minimize when expanded */}
      {!isMinimized && (
        <button
          aria-label="Minimize sidebar"
          title="Minimize sidebar"
          onClick={onToggle}
          className={cn(
            'absolute inset-y-0 right-0 w-2 z-10 opacity-0 hover:opacity-100',
            'cursor-w-resize'
          )}
        />
      )}
    </div>
  );
}
