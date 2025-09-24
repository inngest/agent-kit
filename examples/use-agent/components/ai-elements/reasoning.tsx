'use client';

import { useControllableState } from '@radix-ui/react-use-controllable-state';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Response } from './response';

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number;
  hasStreamStarted: boolean;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
  hasStreamStarted?: boolean;
};

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = false,
    onOpenChange,
    duration: durationProp,
    hasStreamStarted = false,
    children,
    ...props
  }: ReasoningProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });
    const [duration, setDuration] = useControllableState({
      prop: durationProp,
      defaultProp: 0,
    });

    const [hasAutoClosedRef, setHasAutoClosedRef] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [hasClosedOnStart, setHasClosedOnStart] = useState(false);

    // Track duration when streaming starts and ends
    useEffect(() => {
      if (isStreaming) {
        if (startTime === null) {
          setStartTime(Date.now());
        }
      } else if (startTime !== null) {
        setDuration(Math.round((Date.now() - startTime) / 1000));
        setStartTime(null);
      }
    }, [isStreaming, startTime, setDuration]);

    // Auto-open when streaming starts (until stream starts producing text)
    useEffect(() => {
      if (isStreaming && !isOpen && !hasStreamStarted) {
        setIsOpen(true);
      }
    }, [isStreaming, isOpen, hasStreamStarted, setIsOpen]);

    // Auto-close once when streaming finishes (on transition only)
    const prevIsStreamingRef = useRef(isStreaming);
    useEffect(() => {
      const wasStreaming = prevIsStreamingRef.current;
      let timer: any;
      if (wasStreaming && !isStreaming && !defaultOpen && !hasAutoClosedRef) {
        if (isOpen) {
          timer = setTimeout(() => {
            setIsOpen(false);
            setHasAutoClosedRef(true);
          }, 1000);
        } else {
          setHasAutoClosedRef(true);
        }
      }
      prevIsStreamingRef.current = isStreaming;
      return () => {
        if (timer) clearTimeout(timer);
      };
    }, [isStreaming, isOpen, defaultOpen, hasAutoClosedRef, setIsOpen]);

    // Immediately minimize once the first text delta arrives (only once)
    useEffect(() => {
      if (hasStreamStarted && isOpen && !hasClosedOnStart) {
        setIsOpen(false);
        setHasClosedOnStart(true);
      }
    }, [hasStreamStarted, isOpen, hasClosedOnStart, setIsOpen]);

    const handleOpenChange = (open: boolean) => {
      setIsOpen(open);
    };

    return (
      <ReasoningContext.Provider
        value={{ isStreaming, isOpen, setIsOpen, duration, hasStreamStarted }}
      >
        <Collapsible
          className={cn('not-prose mb-4', className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  title?: string;
};

export const ReasoningTrigger = memo(
  ({
    className,
    title = 'Reasoning',
    children,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration, hasStreamStarted } = useReasoning();

    return (
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 text-muted-foreground text-xs font-medium',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon className="size-3 opacity-60" />
            {isStreaming && !hasStreamStarted ? (
              <p>
                <span className="ak-shimmer-wrap relative inline-block opacity-80">
                  <span className="ak-shimmer-base text-foreground">Planning next move...</span>
                  <span aria-hidden="true" className="ak-shimmer-overlay">Planning next move...</span>
                </span>
              </p>
            ) : (
              <p>
                <span className="text-foreground opacity-65">Thought for {duration} seconds</span>
              </p>
            )}
            <ChevronDownIcon
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0',
              )}
            />
            <style>{`
              .ak-shimmer-overlay {
                position: absolute;
                inset: 0;
                color: transparent;
                background-image: linear-gradient(
                  90deg,
                  rgba(255, 255, 255, 0) 0%,
                  rgba(255, 255, 255, 0) 35%,
                  rgba(255, 255, 255, 0.9) 50%,
                  rgba(255, 255, 255, 0) 65%,
                  rgba(255, 255, 255, 0) 100%
                );
                background-size: 200% 100%;
                background-repeat: no-repeat;
                -webkit-background-clip: text;
                background-clip: text;
                -webkit-text-fill-color: transparent;
                animation: ak-shimmer-sweep 2s ease-in-out infinite;
                pointer-events: none;
                will-change: background-position;
              }
              @keyframes ak-shimmer-sweep {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
              }
            `}</style>
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string;
  simulateTyping?: boolean;
  typingSpeedMs?: number;
  chunkSize?: number;
};

export const ReasoningContent = memo(
  ({ className, children, simulateTyping = false, typingSpeedMs = 30, chunkSize = 3, ...props }: ReasoningContentProps) => {
    const [typed, setTyped] = useState<string>(simulateTyping ? '' : children);
    const hasPlayedRef = useRef(false);
    const indexRef = useRef(0);

    useEffect(() => {
      if (!simulateTyping) {
        setTyped(children);
        return;
      }
      if (hasPlayedRef.current) return;
      let index = indexRef.current || 0;
      const text = String(children ?? '');
      if (text.length === 0) {
        setTyped('');
        return;
      }
      const timer = setInterval(() => {
        const next = Math.min(text.length, index + chunkSize);
        setTyped(text.slice(0, next));
        index = next;
        indexRef.current = next;
        if (index >= text.length) {
          clearInterval(timer);
          hasPlayedRef.current = true;
        }
      }, Math.max(typingSpeedMs, 10));
      return () => clearInterval(timer);
    }, [children, simulateTyping, typingSpeedMs, chunkSize]);

    return (
      <CollapsibleContent
        className={cn(
          'mt-4 text-xs opacity-80',
          'text-popover-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2',
          className,
        )}
        {...props}
      >
        <Response className="grid gap-2">{typed}</Response>
      </CollapsibleContent>
    );
  },
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
