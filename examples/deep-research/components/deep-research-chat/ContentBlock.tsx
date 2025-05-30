"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ExternalLink, ChevronDown, Loader2, Maximize2, X } from "lucide-react";
import { Finding } from "./types";
import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";

// Custom DialogContent without the default close button
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-y-auto",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

interface ContentBlockProps {
  query: string;
  reasoning?: string;
  findings: Finding[];
  className?: string;
  isPending?: boolean;
}

interface CollapsibleFindingProps {
  finding: Finding;
  parentExpanded: boolean;
}

function CollapsibleFinding({ finding, parentExpanded }: CollapsibleFindingProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [height, setHeight] = useState<number | 'auto'>(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset expanded state when parent collapses
  useEffect(() => {
    if (!parentExpanded) {
      setIsExpanded(false);
    }
  }, [parentExpanded]);

  useEffect(() => {
    if (contentRef.current) {
      const newHeight = contentRef.current.scrollHeight;
      setHeight(isExpanded ? newHeight : 0);
    }
  }, [isExpanded]);

  return (
    <div className="space-y-2">
      {/* Source header with chevron */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 text-white/90 hover:bg-zinc-700/30 transition-colors rounded px-2 py-1.5"
      >
        <ChevronDown 
          className={cn(
            "h-4 w-4 text-zinc-400 transition-transform duration-200 flex-shrink-0",
            isExpanded ? "transform rotate-0" : "transform -rotate-90"
          )} 
        />
        <div className="flex-1 flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
            <ExternalLink className="h-4 w-4 text-blue-400 flex-shrink-0" />
            <a 
              href={finding.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
              title={finding.source}
            >
              {finding.source}
            </a>
          </div>
        </div>
      </button>

      {/* Collapsible content */}
      <div 
        ref={contentRef}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        className={cn(
          "transition-all duration-200 ease-in-out overflow-hidden",
          isExpanded ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none pl-8">
          <div className="text-white/80">
            {finding.content}
          </div>
        </div>

        {/* Analysis */}
        <div className="bg-zinc-800 rounded p-3 text-sm mt-3 ml-8">
          <div className="font-medium text-white/90 mb-2">Analysis</div>
          <div className="text-white/70 whitespace-pre-wrap">
            {finding.analysis || "Analysis pending..."}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContentBlock({
  query,
  reasoning,
  findings,
  className,
  isPending = false
}: ContentBlockProps) {
  // Separate states for normal and dialog views
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDialogExpanded, setIsDialogExpanded] = useState(true);
  const [height, setHeight] = useState<number | 'auto'>(0);
  const [dialogHeight, setDialogHeight] = useState<number | 'auto'>('auto');
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  // Effect for normal view height
  useEffect(() => {
    if (contentRef.current) {
      const newHeight = contentRef.current.scrollHeight;
      setHeight(isExpanded ? newHeight : 0);
    }
  }, [findings, isExpanded]);

  // Effect for dialog view height
  useEffect(() => {
    if (dialogContentRef.current) {
      const newHeight = dialogContentRef.current.scrollHeight;
      setDialogHeight(isDialogExpanded ? newHeight : 0);
    }
  }, [findings, isDialogExpanded]);

  const contentBlock = (inDialog: boolean = false) => {
    const currentExpanded = inDialog ? isDialogExpanded : isExpanded;
    const setCurrentExpanded = inDialog ? setIsDialogExpanded : setIsExpanded;
    const currentRef = inDialog ? dialogContentRef : contentRef;
    const currentHeight = inDialog ? dialogHeight : height;

    return (
      <div className={cn(
        "bg-zinc-800/50 rounded-lg border border-zinc-700/50",
        inDialog && "h-full flex flex-col",
        !inDialog && className
      )}>
        {/* Query header */}
        <div className="border-b border-zinc-700/50 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white/90">
                {query}
              </h3>
              {reasoning && (
                <p className="mt-2 text-sm text-white/70">
                  {reasoning}
                </p>
              )}
            </div>
            {!inDialog && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDialogOpen(true);
                }}
                className="ml-4 p-1 hover:bg-zinc-700/50 rounded transition-colors"
                title="Expand view"
              >
                <Maximize2 className="h-4 w-4 text-zinc-400" />
              </button>
            )}
          </div>
        </div>

        {/* Findings header */}
        <button
          onClick={() => setCurrentExpanded(!currentExpanded)}
          className="w-full px-4 py-3 flex items-center gap-2 text-white/90 hover:bg-zinc-700/30 transition-colors"
        >
          <ChevronDown 
            className={cn(
              "h-4 w-4 text-zinc-400 transition-transform duration-200",
              currentExpanded ? "transform rotate-0" : "transform -rotate-90"
            )} 
          />
          <span className="text-sm font-medium flex items-center gap-2">
            Findings ({findings.length})
            {isPending && (
              <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            )}
          </span>
        </button>

        {/* Findings content */}
        <div 
          ref={currentRef}
          style={{ height: typeof currentHeight === 'number' ? `${currentHeight}px` : currentHeight }}
          className={cn(
            "divide-y divide-zinc-700/50 transition-all duration-200 ease-in-out",
            currentExpanded ? "opacity-100 overflow-y-auto" : "opacity-0 overflow-hidden",
            inDialog && currentExpanded && "flex-1"
          )}
        >
          {isPending ? (
            <div className="p-4 text-sm text-white/70 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching for relevant information...
            </div>
          ) : findings.length > 0 ? (
            <div className={cn(
              "p-4 space-y-4",
              inDialog && "h-full"
            )}>
              {findings.map((finding, index) => (
                <CollapsibleFinding 
                  key={`${finding.source}-${index}`} 
                  finding={finding}
                  parentExpanded={currentExpanded}
                />
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-white/70">
              No findings available yet.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {contentBlock(false)}
      
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-none w-screen h-[100vh] p-0 bg-zinc-900 text-white border-zinc-800 !overflow-y-auto">
          <div className="flex flex-col h-full max-h-full">
            {/* Custom dialog header */}
            <div className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/50 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/50 flex-shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-white">Expanded View</h2>
                <p className="text-sm text-zinc-400 mt-1">Viewing research findings in full screen</p>
              </div>
              <DialogClose className="p-2 hover:bg-zinc-800 rounded-md transition-colors">
                <X className="h-5 w-5 text-zinc-400" />
              </DialogClose>
            </div>
            
            {/* Content area with padding */}
            <div className="flex-1 p-6 overflow-y-auto min-h-0">
              {contentBlock(true)}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 