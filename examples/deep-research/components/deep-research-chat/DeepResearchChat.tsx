"use client";

import { useState, useRef, useEffect } from "react";
import { DeepResearchMessage } from "./DeepResearchMessage";
import { DeepResearchCard } from "./DeepResearchCard";
import { ChatHeader } from "../chat/ChatHeader";
import { Brain, Paperclip, ChevronDown, ArrowUp, Loader2 } from "lucide-react";
import { ResearchStage, ResearchUpdate } from "./types";
import { ResearchConfiguration } from "./ResearchConfiguration";

interface Finding {
  source: string;
  content: string;
  analysis?: string;
}

interface ReasoningNode {
  id: string;
  parentId: string | null;
  depth: number;
  query: string;
  reasoning: string;
  findings: Finding[];
  reflection?: string;
  relevanceScore?: number;
  children: string[];
}

// Add workflow options
const workflowOptions = [
  { name: "Deep Research", deepResearchEnabled: true },
  { name: "Simple Search", deepResearchEnabled: false },
  { name: "Technical Research", deepResearchEnabled: true },
  { name: "General Research", deepResearchEnabled: false }
];

// Add configuration interface
interface ResearchConfiguration {
  maxDepth: number;
  maxBreadth: number;
  stageCount: number;
  queriesPerStage: number;
}

export function DeepResearchChat() {
  const [updates, setUpdates] = useState<ResearchUpdate[]>([]);
  const [stages, setStages] = useState<ResearchStage[]>([]);
  const [selectedStage, setSelectedStage] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [userQuery, setUserQuery] = useState<string>("");
  const [finalReport, setFinalReport] = useState<string | null>(null);
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isProgrammaticScrolling, setIsProgrammaticScrolling] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startScrollTop, setStartScrollTop] = useState(0);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState("Deep Research");
  const workflowMenuRef = useRef<HTMLDivElement>(null);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [configuration, setConfiguration] = useState<ResearchConfiguration>({
    maxDepth: 2,
    maxBreadth: 3,
    stageCount: 3,
    queriesPerStage: 3
  });

  // Add helper to check if current workflow has deep research enabled
  const isDeepResearchEnabled = () => {
    const currentWorkflow = workflowOptions.find(w => w.name === selectedWorkflow);
    return currentWorkflow?.deepResearchEnabled ?? false;
  };

  // Get the latest update
  const latestUpdate = updates.length > 0 ? updates[updates.length - 1] : null;
  
  // Get the most recent progress percentage
  const progressPercent = latestUpdate?.progress?.percent ?? 0;

  // Scroll to bottom function
  const scrollToBottom = (force = false, smooth = false) => {
    if (chatContainerRef.current && (autoScroll || force)) {
      if (smooth) {
        setIsProgrammaticScrolling(true);
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }
  };

  // Handle user scroll
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const isScrolledToBottom = 
        container.scrollHeight - container.clientHeight <= container.scrollTop + 10;
      
      if (isScrolledToBottom) {
        setAutoScroll(true);
        if (isProgrammaticScrolling) {
          setIsProgrammaticScrolling(false);
        }
      } else if (!isProgrammaticScrolling) {
        setAutoScroll(false);
      }
    };
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isProgrammaticScrolling]);

  // Scroll to bottom when new updates come in
  useEffect(() => {
    scrollToBottom();
  }, [updates]);

  // Function to resize textarea
  const resizeTextarea = () => {
    const textarea = inputRef.current;
    if (!textarea) return;
    
    // Reset the height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height (with a max of ~6 lines)
    const lineHeight = 24; // Approximated line height in pixels
    const maxHeight = lineHeight * 6;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    
    textarea.style.height = `${newHeight}px`;
    
    // Update custom scrollbar
    updateCustomScrollbar();
  };

  // Function to update custom scrollbar position and size
  const updateCustomScrollbar = () => {
    const textarea = inputRef.current;
    const thumb = thumbRef.current;
    
    if (!textarea || !thumb) return;
    
    const scrollPercentage = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
    const thumbHeight = Math.max(20, (textarea.clientHeight / textarea.scrollHeight) * textarea.clientHeight);
    
    thumb.style.height = `${thumbHeight}px`;
    
    // Only show thumb if content exceeds max height
    if (textarea.scrollHeight > textarea.clientHeight) {
      thumb.style.display = 'block';
      const thumbPosition = scrollPercentage * (textarea.clientHeight - thumbHeight);
      thumb.style.top = `${thumbPosition}px`;
    } else {
      thumb.style.display = 'none';
    }
  };

  // Handle thumb drag start
  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    setStartY(e.clientY);
    
    const textarea = inputRef.current;
    if (textarea) {
      setStartScrollTop(textarea.scrollTop);
    }
  };

  // Handle thumb dragging
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const textarea = inputRef.current;
    if (!textarea) return;
    
    const deltaY = e.clientY - startY;
    const scrollFactor = textarea.scrollHeight / textarea.clientHeight;
    
    textarea.scrollTop = startScrollTop + (deltaY * scrollFactor);
    updateCustomScrollbar();
  };

  // Handle thumb drag end
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle track click to jump to position
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = e.currentTarget;
    const textarea = inputRef.current;
    const thumb = thumbRef.current;
    
    if (!textarea || !thumb) return;
    
    // Get relative position in the track
    const rect = track.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    
    // Calculate thumb height
    const thumbHeight = Math.max(20, (textarea.clientHeight / textarea.scrollHeight) * textarea.clientHeight);
    
    // Calculate new scroll position
    const scrollableHeight = textarea.scrollHeight - textarea.clientHeight;
    const percentage = (relativeY - thumbHeight / 2) / (textarea.clientHeight - thumbHeight);
    const scrollAmount = percentage * scrollableHeight;
    
    // Update scroll position
    textarea.scrollTop = Math.max(0, Math.min(scrollAmount, scrollableHeight));
    updateCustomScrollbar();
  };

  // Handle textarea scroll
  const handleTextareaScroll = () => {
    updateCustomScrollbar();
  };

  // Add and remove mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startY, startScrollTop]);

  // Resize textarea when input changes
  useEffect(() => {
    resizeTextarea();
  }, [userQuery]);

  // Initialize textarea on mount
  useEffect(() => {
    if (inputRef.current) {
      resizeTextarea();
      updateCustomScrollbar();
    }
  }, []);

  // Add brain pulse keyframes
  const brainPulseKeyframes = `
    @keyframes brainPulse {
      0% {
        filter: drop-shadow(0 0 2px rgba(219, 39, 119, 0.3));
        opacity: 0.7;
      }
      50% {
        filter: drop-shadow(0 0 6px rgba(219, 39, 119, 0.8));
        opacity: 1;
      }
      100% {
        filter: drop-shadow(0 0 2px rgba(219, 39, 119, 0.3));
        opacity: 0.7;
      }
    }
  `;

  // Close workflow menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workflowMenuRef.current && !workflowMenuRef.current.contains(event.target as Node)) {
        setWorkflowMenuOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle workflow change
  const handleWorkflowChange = (workflowName: string) => {
    setSelectedWorkflow(workflowName);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userQuery.trim()) return;

    console.log("Starting research with query:", userQuery);
    console.log("Using configuration:", configuration);

    // Hide the input with animation
    setIsInputVisible(false);
    setIsLoading(true);
    setUpdates([]);
    setStages([]);
    setFinalReport(null);
    setAutoScroll(true);

    try {
      console.log("Making fetch request...");
      const response = await fetch("/api/deep-research", {
        method: "POST",
        body: JSON.stringify({ 
          topic: userQuery,
          useV2: true,
          configuration
        }),
      });

      console.log("Response received:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        type: response.type,
        bodyUsed: response.bodyUsed
      });

      // Handle response
      const reader = response.body?.getReader();
      console.log("Reader created:", !!reader);

      if (!reader) {
        console.error("No reader available");
        setIsLoading(false);
        setIsInputVisible(true);
        return;
      }

      let buffer = '';
      const decoder = new TextDecoder();
      console.log("Starting to read stream...");

      try {
        while (true) {
          console.log("Reading chunk...");
          const { done, value } = await reader.read();
          
          if (done) {
            console.log("Stream complete");
            break;
          }

          // Decode the chunk and add to buffer
          const newText = decoder.decode(value, { stream: true });
          console.log("Decoded text:", newText);
          
          buffer += newText;
          
          // Process complete messages from buffer
          const lines = buffer.split('\n');
          console.log("Split lines:", lines);
          
          // Keep the last potentially incomplete line in buffer
          buffer = lines.pop() || '';
          console.log("Remaining buffer:", buffer);

          for (const line of lines) {
            if (line.trim() === '') {
              console.log("Skipping empty line");
              continue;
            }
            
            try {
              console.log("Processing line:", line);
              const event = JSON.parse(line);
              console.log("Successfully parsed JSON:", event);

              if (event.data) {
                const updateData = event.data as ResearchUpdate;
                console.log("Processing update:", {
                  message: updateData.message,
                  progress: updateData.progress,
                  stage: updateData.stage,
                  agent: updateData.agent,
                  tree: updateData.tree,
                  stages: updateData.stages
                });

                // Check if this is the initial event
                if (updateData.eventType === "progress" && 
                    updateData.progress?.percent === 5 && 
                    updateData.progress?.currentStep === "Initializing") {
                  setIsInitializing(true);
                }

                // If we receive stages, we're past initialization
                if (updateData.stages && updateData.stages.length > 0) {
                  setIsInitializing(false);
                }

                // Update state
                setUpdates(prev => {
                  console.log("Current updates:", prev);
                  // Only add the update if it's not already present
                  if (!prev.some(u => 
                    u.timestamp === updateData.timestamp && 
                    u.message === updateData.message
                  )) {
                    const newUpdates = [...prev, updateData];
                    console.log("New updates:", newUpdates);
                    return newUpdates;
                  }
                  return prev;
                });

                // Handle stages array first if present
                if (updateData.stages && updateData.stages.length > 0) {
                  console.log("Received stages update:", updateData.stages);
                  setStages(prev => {
                    // Create a map of existing stages for quick lookup
                    const existingStagesMap = new Map(prev.map(s => [s.id, s]));
                    
                    // Process each stage from the update
                    const updatedStages = updateData.stages!.map(newStage => {
                      const existing = existingStagesMap.get(newStage.id);
                      return {
                        id: newStage.id,
                        name: newStage.name,
                        description: newStage.description,
                        completed: existing?.completed || false,
                        reasoningTree: newStage.reasoningTree || existing?.reasoningTree,
                        analysis: newStage.analysis || existing?.analysis,
                        reasoningComplete: newStage.reasoningComplete ?? existing?.reasoningComplete ?? false,
                        analysisComplete: newStage.analysisComplete ?? existing?.analysisComplete ?? false
                      };
                    });

                    console.log("Updated stages:", updatedStages);
                    return updatedStages;
                  });
                }

                // Then handle individual stage updates
                if (updateData.stage) {
                  const newStage: ResearchStage = {
                    id: updateData.stage.index,
                    name: updateData.stage.name,
                    description: updateData.stage.description,
                    completed: false,
                    reasoningTree: updateData.stage.reasoningTree,
                    reasoningComplete: false,
                    analysisComplete: false
                  };

                  setStages(prev => {
                    // Find if this stage already exists
                    const existingIndex = prev.findIndex(s => s.id === newStage.id);
                    
                    if (existingIndex === -1) {
                      // If it's a new stage, add it
                      return [...prev, newStage];
                    } else {
                      // If it exists, update it while preserving existing properties
                      return prev.map((stage, index) => 
                        index === existingIndex ? {
                          ...stage,
                          ...newStage,
                          // Preserve completion states unless explicitly provided
                          reasoningComplete: newStage.reasoningComplete ?? stage.reasoningComplete,
                          analysisComplete: newStage.analysisComplete ?? stage.analysisComplete,
                          // Properly merge reasoning trees using a Map for deduplication by query
                          reasoningTree: {
                            nodes: (() => {
                              // Create a Map using query as the key for deduplication
                              const nodeMap = new Map(
                                (stage.reasoningTree?.nodes || []).map(node => [node.query, node])
                              );
                              
                              // Update or add new nodes, preferring newer nodes for the same query
                              (newStage.reasoningTree?.nodes || []).forEach(node => {
                                // If we have an existing node with this query
                                const existingNode = nodeMap.get(node.query);
                                if (existingNode) {
                                  // Only update if the new node has more information
                                  if (node.findings.length > existingNode.findings.length ||
                                      node.children.length > existingNode.children.length ||
                                      node.reflection !== undefined) {
                                    nodeMap.set(node.query, node);
                                  }
                                } else {
                                  // No existing node with this query, add the new one
                                  nodeMap.set(node.query, node);
                                }
                              });
                              
                              // Convert back to array
                              return Array.from(nodeMap.values());
                            })()
                          }
                        } : stage
                      );
                    }
                  });

                  // Only update selected stage if it's not already selected
                  if (selectedStage !== updateData.stage.index) {
                    setSelectedStage(updateData.stage.index);
                  }
                }

                // Handle completion
                if (updateData.eventType === 'complete' && updateData.completed) {
                  console.log("Research complete, setting final report");
                  console.log("Final analysis:", updateData.analysis);
                  setFinalReport(updateData.analysis || null);
                  setIsLoading(false);
                  reader.cancel();
                  break;
                }
              } else {
                console.log("Event has no data property:", event);
              }
            } catch (error) {
              console.error("Error processing line:", error);
              console.log("Problematic line:", line);
            }
          }
        }
      } catch (error) {
        console.error("Error in stream reading:", error);
      }
    } catch (error) {
      console.error("Error in research:", error);
    } finally {
      console.log("Request complete");
      setIsLoading(false);
      setIsInputVisible(true);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (userQuery.trim() && !isLoading) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  const handleNewChat = () => {
    setUserQuery("");
    setUpdates([]);
    setStages([]);
    setFinalReport(null);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      <style>{brainPulseKeyframes}</style>
      <style>
        {`
          /* Custom scrollbar styles */
          .custom-scrollbar {
            position: relative;
            overflow-y: auto;
            scrollbar-width: none; /* Firefox */
          }
          
          .custom-scrollbar::-webkit-scrollbar {
            display: none; /* WebKit browsers */
          }
          
          /* Custom scrollbar track */
          .scrollbar-track {
            position: absolute;
            top: 0;
            right: 0;
            width: 8px;
            height: 100%;
            background-color: transparent;
            z-index: 10;
            cursor: pointer;
          }
          
          /* Custom scrollbar thumb */
          .scrollbar-thumb {
            position: absolute;
            width: 6px;
            right: 1px;
            border-radius: 3px;
            background-color: rgba(156, 163, 175, 0.5);
            cursor: grab;
            transition: background-color 0.2s, width 0.2s, right 0.2s;
          }
          
          .scrollbar-thumb:hover,
          .scrollbar-thumb:active {
            background-color: rgba(156, 163, 175, 0.8);
            width: 8px;
            right: 0;
          }
          
          .scrollbar-thumb.dragging {
            cursor: grabbing;
            background-color: rgba(156, 163, 175, 0.8);
            width: 8px;
            right: 0;
          }
          
          .dark .scrollbar-thumb {
            background-color: rgba(161, 161, 170, 0.5);
          }
          
          .dark .scrollbar-thumb:hover,
          .dark .scrollbar-thumb:active,
          .dark .scrollbar-thumb.dragging {
            background-color: rgba(161, 161, 170, 0.8);
          }
        `}
      </style>
      <ChatHeader
        onNewChat={handleNewChat}
        onShareChat={() => {}}
        onViewConversations={() => {}}
        onViewProfile={() => {}}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-6 px-4 sm:px-8 md:px-12 lg:px-20 xl:px-[20%]"
        >
          {/* Initial message */}
          {updates.length === 0 ? (
            <div className="flex items-center justify-start h-full ml-4 xl:justify-center xl:ml-0">
              <div className="text-left xl:text-center">
                <h2 className="text-2xl font-semibold mb-1 dark:text-white">Deep Research 🔍</h2>
                <p className="text-xl text-gray-500 dark:text-zinc-400 mb-4">
                  What would you like me to research?
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* User query */}
              <DeepResearchMessage 
                role="user"
                content={userQuery}
              />

              {/* Initial loading state */}
              {isInitializing && (
                <div className="flex justify-start">
                  <div className="w-full max-w-[1200px] mx-auto">
                    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                        <span className="text-zinc-300">Creating research plan...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Research process card */}
              {!isInitializing && stages.length > 0 && (
                <div className="flex justify-start">
                  <div className="w-full max-w-[1200px] mx-auto">
                    <DeepResearchCard
                      stages={stages}
                      updates={updates}
                      selectedStage={selectedStage}
                      onStageSelect={setSelectedStage}
                      configuration={configuration}
                    />
                  </div>
                </div>
              )}

              {/* Final report */}
              {finalReport && (
                <DeepResearchMessage 
                  role="assistant"
                  content={finalReport}
                />
              )}
            </>
          )}

          {/* Floating scroll to bottom button */}
          {!autoScroll && !isProgrammaticScrolling && (
            <button 
              onClick={() => scrollToBottom(true, true)}
              className="fixed bottom-36 right-8 w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shadow-md hover:bg-zinc-300 dark:hover:bg-zinc-600 focus:outline-none z-10"
            >
              <ChevronDown size={20} className="text-zinc-800 dark:text-zinc-200" />
            </button>
          )}
        </div>

        {/* Input area */}
        <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-8">
          <form onSubmit={handleSubmit} className="relative">
            <div className="w-full rounded-[24px] px-2.5 pb-2.5 pt-5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm flex flex-col">
              {/* First row - Textarea with custom scrollbar */}
              <div className="w-full mb-3 relative">
                <div className="relative">
                  <textarea 
                    ref={inputRef}
                    className="custom-scrollbar w-full px-2.5 pb-2 bg-transparent border-none focus:ring-0 focus:outline-none text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 resize-none min-h-[24px]"
                    placeholder="Enter a research topic..."
                    value={userQuery}
                    onChange={(e) => {
                      setUserQuery(e.target.value);
                      resizeTextarea();
                    }}
                    onKeyDown={handleKeyDown}
                    onScroll={handleTextareaScroll}
                    rows={1}
                    disabled={isLoading}
                    style={{
                      height: 'auto',
                    }}
                  />
                  <div className="scrollbar-track" onClick={handleTrackClick}>
                    <div 
                      ref={thumbRef} 
                      className={`scrollbar-thumb ${isDragging ? 'dragging' : ''}`}
                      onMouseDown={handleThumbMouseDown}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Second row - All buttons */}
              <div className="flex items-center justify-between">
                {/* Left side buttons */}
                <div className="flex items-center space-x-2">
                  {/* Attachment button */}
                  <button 
                    type="button"
                    className="py-2 px-2 rounded-2xl border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 focus:outline-none"
                    disabled={isLoading}
                  >
                    <Paperclip size={16} className='rotate-[315deg]' />
                  </button>

                  {/* Research Configuration */}
                  <ResearchConfiguration
                    configuration={configuration}
                    onConfigurationChange={setConfiguration}
                    isExpanded={isConfigExpanded}
                    onToggleExpand={() => setIsConfigExpanded(!isConfigExpanded)}
                  />
                  
                  {/* Deep Research status indicator - only show if deep research is enabled */}
                  {isDeepResearchEnabled() && (
                    <div className="flex items-center py-2 px-3 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-300 dark:border-violet-800/30">
                      <style>
                        {`
                          .brain-gradient {
                            stroke: url(#brainGradient);
                          }
                        `}
                      </style>
                      <svg width="0" height="0">
                        <defs>
                          <linearGradient id="brainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#db2777" />
                            <stop offset="100%" stopColor="#7c3aed" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <Brain 
                        className="brain-gradient mr-1.5"
                        size={16}
                        style={{
                          filter: "drop-shadow(0 0 2px rgba(219, 39, 119, 0.5))",
                          animation: "brainPulse 2s infinite ease-in-out"
                        }}
                      />
                      Deep Research
                    </div>
                  )}
                </div>

                {/* Right side buttons */}
                <div className="flex items-center">
                  {/* Workflow selector */}
                  <div className="relative">
                    <button
                      type="button"
                      className="py-1 px-3 rounded-full text-sm flex items-center text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 focus:outline-none"
                      onClick={() => setWorkflowMenuOpen(prev => !prev)}
                      disabled={isLoading}
                    >
                      {selectedWorkflow}
                      <ChevronDown size={16} className="ml-1" />
                    </button>
                    
                    {/* Workflow dropdown menu */}
                    {workflowMenuOpen && (
                      <div 
                        ref={workflowMenuRef}
                        className="absolute bottom-full mb-1 right-0 w-48 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-10"
                      >
                        <ul className="py-1">
                          {workflowOptions.map((workflow) => (
                            <li key={workflow.name}>
                              <button
                                type="button"
                                className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center"
                                onClick={() => {
                                  handleWorkflowChange(workflow.name);
                                  setWorkflowMenuOpen(false);
                                }}
                              >
                                {workflow.name}
                                {workflow.deepResearchEnabled && (
                                  <Brain
                                    className="brain-gradient ml-2"
                                    size={12}
                                  />
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  
                  {/* Submit button */}
                  <button 
                    type="submit"
                    className="p-2 ml-1 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                    disabled={!userQuery.trim() || isLoading}
                  >
                    {isLoading ? (
                      <div className="h-5 w-5 border-t-2 border-current rounded-full animate-spin"></div>
                    ) : (
                      <ArrowUp size={20} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 