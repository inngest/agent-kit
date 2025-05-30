"use client";

import { cn } from "@/lib/utils";
import { Info, Search } from "lucide-react";
import { ContentBlock } from "./ContentBlock";
import { ResearchStage, ResearchUpdate } from "./types";
import { DeepResearchProgress } from "./DeepResearchProgress";
import { calculateProgress } from "./utils";
import { DeepResearchStages } from "./DeepResearchStages";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ResearchConfiguration {
  maxDepth: number;
  maxBreadth: number;
  stageCount: number;
  queriesPerStage: number;
}

interface DeepResearchCardProps {
  stages: ResearchStage[];
  updates: ResearchUpdate[];
  selectedStage: number;
  onStageSelect: (stageId: number) => void;
  configuration?: ResearchConfiguration;
}

export function DeepResearchCard({
  stages,
  updates,
  selectedStage,
  onStageSelect,
  configuration
}: DeepResearchCardProps) {
  const currentStage = stages.find(s => s.id === selectedStage);
  const latestUpdate = updates[updates.length - 1];
  const progress = calculateProgress(stages, latestUpdate, configuration);

  // Calculate expected total nodes based on configuration
  const expectedTotalNodes = configuration ? 
    configuration.stageCount * (
      configuration.queriesPerStage + // Initial queries
      (configuration.maxDepth > 1 ? configuration.maxBreadth : 0) // Follow-up queries if depth > 1
    ) : 0;

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden h-[600px]">
      <div className="flex h-full">
        {/* Left sidebar with stages */}
        <div className="w-[280px] min-w-[280px] border-r border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex-shrink-0">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-white/80">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  <span className="font-medium">Research Progress</span>
                </div>
                {configuration && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="p-1 hover:bg-white/10 rounded-full transition-colors">
                          <Info size={16} className="text-white/60" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-zinc-800 text-white border-zinc-700">
                        <div className="space-y-2 p-2">
                          <div>
                            <p className="font-medium mb-1">Research Configuration</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/80">
                              <span>Stages: {configuration.stageCount}</span>
                              <span>Queries/Stage: {configuration.queriesPerStage}</span>
                              <span>Max Depth: {configuration.maxDepth}</span>
                              <span>Max Breadth: {configuration.maxBreadth}</span>
                            </div>
                          </div>
                          {latestUpdate?.tree && expectedTotalNodes > 0 && (
                            <div>
                              <p className="font-medium mb-1">Research Progress</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/80">
                                <span>Nodes: {latestUpdate.tree.nodeCount || 0}/{expectedTotalNodes}</span>
                                <span>With Findings: {latestUpdate.tree.nodesWithFindings || 0}</span>
                                <span>Current Depth: {latestUpdate.tree.maxDepth || 0}/{configuration.maxDepth}</span>
                                <span>Completion: {((latestUpdate.tree.nodesWithFindings || 0) / expectedTotalNodes * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <DeepResearchProgress
                percent={progress.percent}
                currentStep={progress.currentStep}
                agent={latestUpdate?.agent}
                tree={latestUpdate?.tree}
                className="mt-2"
              />
            </div>
          </div>
          <div className="p-2 space-y-1 overflow-y-auto">
            <DeepResearchStages
              stages={stages}
              selectedStage={selectedStage}
              onStageSelect={onStageSelect}
              configuration={configuration}
            />
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Stage content */}
          <div className="p-4 space-y-4 overflow-y-auto h-full">
            {/* Stage description */}
            {currentStage && (
              <div className="text-zinc-300 text-sm">
                {currentStage.description}
              </div>
            )}

            {/* Research Progress with ContentBlocks */}
            {currentStage?.reasoningTree?.nodes && currentStage.reasoningTree.nodes.length > 0 && (
              <div className="mt-4">
                <div className="space-y-4">
                  {currentStage.reasoningTree.nodes.map((node, nodeIndex) => (
                    <ContentBlock
                      key={node.id}
                      query={node.query}
                      reasoning={node.reasoning}
                      findings={node.findings}
                      isPending={node.findings.length === 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Stage analysis */}
            {currentStage?.analysis && (
              <div className="mt-6 p-4 bg-zinc-800 rounded-lg">
                <h3 className="text-lg font-medium text-white/90 mb-3">Analysis</h3>
                <div className="prose prose-invert max-w-none">
                  {currentStage.analysis}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 