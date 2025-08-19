'use client';

import { Loader2Icon, SendIcon, SquareIcon, XIcon, PlusIcon, MicIcon, PaperclipIcon, SearchIcon, ImageIcon } from 'lucide-react';
import type {
  ComponentProps,
  HTMLAttributes,
  KeyboardEventHandler,
} from 'react';
import { Children, useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ChatStatus } from 'ai';

export type PromptInputProps = HTMLAttributes<HTMLFormElement>;

export const PromptInput = ({ className, ...props }: PromptInputProps) => (
  <form
    className={cn(
      'w-full divide-y overflow-hidden rounded-3xl border bg-background shadow-sm',
      className,
    )}
    {...props}
  />
);

export type PromptInputTextareaProps = ComponentProps<typeof Textarea> & {
  minHeight?: number;
  maxHeight?: number;
};

export const PromptInputTextarea = forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(({
  onChange,
  className,
  placeholder = 'What would you like to know?',
  minHeight = 48,
  maxHeight = 164,
  ...props
}, ref) => {
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow newline
        return;
      }

      // Submit on Enter (without Shift)
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  return (
    <Textarea
      ref={ref}
      className={cn(
        'w-full resize-none rounded-none border-none p-3 shadow-none outline-none ring-0',
        'bg-transparent dark:bg-transparent field-sizing-content max-h-[6lh]',
        'focus-visible:ring-0',
        className,
      )}
      name="message"
      onChange={(e) => {
        onChange?.(e);
      }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  );
});

PromptInputTextarea.displayName = 'PromptInputTextarea';

export type PromptInputToolbarProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputToolbar = ({
  className,
  ...props
}: PromptInputToolbarProps) => (
  <div
    className={cn('flex items-center justify-between p-1', className)}
    {...props}
  />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({
  className,
  ...props
}: PromptInputToolsProps) => (
  <div
    className={cn(
      'flex items-center gap-1',
      '[&_button:first-child]:rounded-bl-xl',
      className,
    )}
    {...props}
  />
);

export type PromptInputButtonProps = ComponentProps<typeof Button>;

export const PromptInputButton = ({
  variant = 'ghost',
  className,
  size,
  ...props
}: PromptInputButtonProps) => {
  const newSize =
    (size ?? Children.count(props.children) > 1) ? 'default' : 'icon';

  return (
    <Button
      className={cn(
        'shrink-0 gap-1.5 rounded-lg',
        variant === 'ghost' && 'text-muted-foreground',
        newSize === 'default' && 'px-3',
        className,
      )}
      size={newSize}
      type="button"
      variant={variant}
      {...props}
    />
  );
};

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: ChatStatus;
};

export const PromptInputSubmit = ({
  className,
  variant = 'default',
  size = 'icon',
  status,
  children,
  ...props
}: PromptInputSubmitProps) => {
  let Icon = <SendIcon className="size-4" />;

  if (status === 'submitted') {
    Icon = <Loader2Icon className="size-4 animate-spin" />;
  } else if (status === 'streaming') {
    Icon = <SquareIcon className="size-4" />;
  } else if (status === 'error') {
    Icon = <XIcon className="size-4" />;
  }

  return (
    <Button
      className={cn('gap-1.5 rounded-lg', className)}
      size={size}
      type="submit"
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </Button>
  );
};

export type PromptInputModelSelectProps = ComponentProps<typeof Select>;

export const PromptInputModelSelect = (props: PromptInputModelSelectProps) => (
  <Select {...props} />
);

export type PromptInputModelSelectTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

export const PromptInputModelSelectTrigger = ({
  className,
  ...props
}: PromptInputModelSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      'border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors',
      'hover:bg-accent hover:text-foreground [&[aria-expanded="true"]]:bg-accent [&[aria-expanded="true"]]:text-foreground',
      className,
    )}
    {...props}
  />
);

export type PromptInputModelSelectContentProps = ComponentProps<
  typeof SelectContent
>;

export const PromptInputModelSelectContent = ({
  className,
  ...props
}: PromptInputModelSelectContentProps) => (
  <SelectContent className={cn(className)} {...props} />
);

export type PromptInputModelSelectItemProps = ComponentProps<typeof SelectItem>;

export const PromptInputModelSelectItem = ({
  className,
  ...props
}: PromptInputModelSelectItemProps) => (
  <SelectItem className={cn(className)} {...props} />
);

export type PromptInputModelSelectValueProps = ComponentProps<
  typeof SelectValue
>;

export const PromptInputModelSelectValue = ({
  className,
  ...props
}: PromptInputModelSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
);

export type ResponsivePromptInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  status?: ChatStatus;
  className?: string;
  onPlusClick?: () => void;
  onMicClick?: () => void;
};

export const ResponsivePromptInput = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask anything',
  disabled = false,
  status,
  className,
  onPlusClick,
  onMicClick,
}: ResponsivePromptInputProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Memoized function to check if content needs expansion
  const checkExpansion = useCallback(() => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    
    // Check for explicit newlines first
    if (value.includes('\n')) {
      if (!isExpanded) setIsExpanded(true);
      return;
    }
    
    // Create a temporary span to measure text width
    const tempSpan = document.createElement('span');
    tempSpan.style.position = 'absolute';
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.whiteSpace = 'nowrap';
    tempSpan.style.fontSize = window.getComputedStyle(textarea).fontSize;
    tempSpan.style.fontFamily = window.getComputedStyle(textarea).fontFamily;
    tempSpan.style.fontWeight = window.getComputedStyle(textarea).fontWeight;
    tempSpan.style.letterSpacing = window.getComputedStyle(textarea).letterSpacing;
    tempSpan.textContent = value || textarea.placeholder;
    
    document.body.appendChild(tempSpan);
    const textWidth = tempSpan.getBoundingClientRect().width;
    document.body.removeChild(tempSpan);
    
    // Get the actual available width (accounting for padding)
    const availableWidth = textarea.getBoundingClientRect().width - 48; // 24px padding on each side (px-6)
    
    const shouldExpand = textWidth >= availableWidth;
    
    if (shouldExpand && !isExpanded) {
      setIsExpanded(true);
    } else if (!value.trim() && isExpanded) {
      setIsExpanded(false);
    }
  }, [value, isExpanded]);

  // Check if content needs expansion with debouncing to prevent infinite loops
  useEffect(() => {
    // Use requestAnimationFrame to debounce and prevent layout thrashing
    const timeoutId = setTimeout(() => {
      checkExpansion();
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, [checkExpansion]);

  // Refocus cursor at end of text when transitioning to expanded mode
  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      const textarea = textareaRef.current;
      // Use setTimeout to ensure the DOM has updated after the layout change
      setTimeout(() => {
        textarea.focus();
        // Set cursor position to the end of the text
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      }, 0);
    }
  }, [isExpanded]);

  if (isExpanded) {
    // Expanded vertical layout
    return (
      <PromptInput onSubmit={onSubmit} className={className}>
        <div className="flex flex-col">
          {/* Textarea container with gradient overlays */}
          <div className="relative w-full mb-3">
            <PromptInputTextarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
              placeholder={placeholder}
              disabled={disabled}
              className="w-full px-6 py-0 pt-4 text-base leading-6 placeholder:text-base min-h-[3lh] max-h-[15lh] resize-none"
            />
            
            {/* Top gradient overlay */}
            <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-background to-transparent pointer-events-none" />
            
            {/* Bottom gradient overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          </div>
          
          {/* Action buttons in a row below textarea */}
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center">
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <PromptInputButton
                        aria-label="Add"
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="h-9 w-9 rounded-full"
                      >
                        <PlusIcon className="size-4" />
                      </PromptInputButton>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Add files and more
                  </TooltipContent>
                </Tooltip>
                <PopoverContent className="w-56 p-0" align="start" side="top">
                  <div className="px-2 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2 w-full justify-start px-2 py-1.5 h-auto font-normal"
                      onClick={() => {
                        setIsPopoverOpen(false);
                        onPlusClick?.();
                      }}
                    >
                      <PaperclipIcon className="size-4" />
                      Add photos & files
                    </Button>
                  </div>
                  
                  <Separator />
                  
                  <div className="px-2 py-2 space-y-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2 w-full justify-start px-2 py-1.5 h-auto font-normal"
                      onClick={() => setIsPopoverOpen(false)}
                    >
                      <SearchIcon className="size-4" />
                      Deep research
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2 w-full justify-start px-2 py-1.5 h-auto font-normal"
                      onClick={() => setIsPopoverOpen(false)}
                    >
                      <ImageIcon className="size-4" />
                      Create image
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <PromptInputButton
                    aria-label="Voice input"
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={onMicClick}
                    className="h-9 w-9 rounded-full"
                  >
                    <MicIcon className="size-4" />
                  </PromptInputButton>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Dictate
                </TooltipContent>
              </Tooltip>

              <PromptInputSubmit
                disabled={disabled || !value.trim()}
                status={status}
                size="icon"
                className="rounded-full size-9"
              />
            </div>
          </div>
        </div>
      </PromptInput>
    );
  }

  // Compact horizontal layout (original)
  return (
    <PromptInput onSubmit={onSubmit} className={className}>
      <div className="flex h-14 items-center gap-2 px-3">
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <PromptInputButton
                  aria-label="Add"
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="h-10 w-10 rounded-full"
                >
                  <PlusIcon className="size-5" />
                </PromptInputButton>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              Add files and more
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-56 p-0" align="start" side="top">
            <div className="px-2 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 w-full justify-start px-2 py-1.5 h-auto font-normal"
                onClick={() => {
                  setIsPopoverOpen(false);
                  onPlusClick?.();
                }}
              >
                <PaperclipIcon className="size-4" />
                Add photos & files
              </Button>
            </div>
            
            <Separator />
            
            <div className="px-2 py-2 space-y-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 w-full justify-start px-2 py-1.5 h-auto font-normal"
                onClick={() => setIsPopoverOpen(false)}
              >
                <SearchIcon className="size-4" />
                Deep research
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 w-full justify-start px-2 py-1.5 h-auto font-normal"
                onClick={() => setIsPopoverOpen(false)}
              >
                <ImageIcon className="size-4" />
                Create image
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1 pt-10">
          <PromptInputTextarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full px-0 py-0 text-base leading-6 placeholder:text-base"
            style={{ height: '32px', lineHeight: '24px' }}
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <PromptInputButton
              aria-label="Voice input"
              variant="ghost"
              size="icon"
              type="button"
              onClick={onMicClick}
              className="hover:bg-transparent"
            >
              <MicIcon className="size-4" />
            </PromptInputButton>
          </TooltipTrigger>
          <TooltipContent side="top">
            Dictate
          </TooltipContent>
        </Tooltip>

        <PromptInputSubmit
          disabled={disabled || !value.trim()}
          status={status}
          size="icon"
          className="rounded-full size-9"
        />
      </div>
    </PromptInput>
  );
};
