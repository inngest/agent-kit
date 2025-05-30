"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronRight, Info } from "lucide-react";

interface ResearchConfiguration {
  maxDepth: number;
  maxBreadth: number;
  stageCount: number;
  queriesPerStage: number;
}

interface ResearchStage {
  id: number;
  name: string;
  description: string;
  completed: boolean;
  reasoningComplete?: boolean;
  analysisComplete?: boolean;
  reasoningTree?: {
    nodes: Array<{
      depth: number;
      findings: any[];
    }>;
  };
}

interface DeepResearchStagesProps {
  stages: ResearchStage[];
  selectedStage: number;
  onStageSelect: (index: number) => void;
  configuration?: ResearchConfiguration;
}

export function DeepResearchStages({ 
  stages, 
  selectedStage, 
  onStageSelect,
  configuration
}: DeepResearchStagesProps) {
  // Calculate stage progress
  const getStageProgress = (stage: ResearchStage) => {
    if (!stage.reasoningTree?.nodes) return 0;
    
    const totalNodes = stage.reasoningTree.nodes.length;
    const nodesWithFindings = stage.reasoningTree.nodes.filter(n => n.findings.length > 0).length;
    
    return totalNodes > 0 ? Math.round((nodesWithFindings / totalNodes) * 100) : 0;
  };

  // Get stage status
  const getStageStatus = (stage: ResearchStage, index: number) => {
    if (stage.analysisComplete) return "complete";
    if (stage.reasoningComplete) return "analysis";
    if (getStageProgress(stage) > 0) return "in-progress";
    if (index === selectedStage) return "active";
    return "pending";
  };

  // Get expected nodes for a stage based on configuration
  const getExpectedNodes = (configuration?: ResearchConfiguration) => {
    if (!configuration) return 0;
    return configuration.queriesPerStage + 
           (configuration.maxDepth > 1 ? configuration.maxBreadth : 0);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          Research Stages
        </h2>
        {configuration && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {configuration.stageCount} stages planned
          </div>
        )}
      </div>
      
      <div className="space-y-2">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          const status = getStageStatus(stage, index);
          const progress = getStageProgress(stage);
          const expectedNodes = getExpectedNodes(configuration);
          const currentNodes = stage.reasoningTree?.nodes.length || 0;
          
          return (
            <div key={stage.id} className="relative">
              <div 
                className={cn(
                  "flex items-start relative cursor-pointer group p-3 rounded-lg transition-all duration-200",
                  selectedStage === index 
                    ? "bg-zinc-100 dark:bg-zinc-800" 
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                )}
                onClick={() => onStageSelect(index)}
              >
                {/* Vertical line */}
                {!isLast && (
                  <div className="absolute left-[19px] top-[30px] w-[2px] h-[calc(100%+8px)] bg-zinc-200 dark:bg-zinc-700" />
                )}
                
                {/* Status circle */}
                <div className={cn(
                  "rounded-full h-8 w-8 flex items-center justify-center border relative z-10",
                  status === "complete" ? "bg-green-500 border-green-500" :
                  status === "analysis" ? "bg-blue-500 border-blue-500" :
                  status === "in-progress" ? "bg-yellow-500 border-yellow-500" :
                  status === "active" ? "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100" :
                  "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600"
                )}>
                  {status === "complete" && (
                    <Check className="h-4 w-4 text-white" />
                  )}
                  {status === "analysis" && (
                    <Info className="h-4 w-4 text-white" />
                  )}
                  {status === "in-progress" && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                  {(status === "active" || status === "pending") && (
                    <ChevronRight className={cn(
                      "h-4 w-4",
                      status === "active"
                        ? "text-white dark:text-zinc-900"
                        : "text-zinc-400 dark:text-zinc-500"
                    )} />
                  )}
                </div>
                
                {/* Stage content */}
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className={cn(
                      "font-medium",
                      selectedStage === index
                        ? "text-zinc-900 dark:text-white"
                        : "text-zinc-600 dark:text-zinc-400"
                    )}>
                      {stage.name}
                    </h3>
                    {progress > 0 && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {progress}% complete
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    "text-sm mt-1",
                    selectedStage === index
                      ? "text-zinc-600 dark:text-zinc-300"
                      : "text-zinc-500 dark:text-zinc-500"
                  )}>
                    {stage.description}
                  </p>
                  {/* Progress details */}
                  {(currentNodes > 0 || expectedNodes > 0) && (
                    <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Nodes: {currentNodes}/{expectedNodes}</span>
                      {stage.reasoningTree?.nodes && (
                        <span>With Findings: {stage.reasoningTree.nodes.filter(n => n.findings.length > 0).length}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 