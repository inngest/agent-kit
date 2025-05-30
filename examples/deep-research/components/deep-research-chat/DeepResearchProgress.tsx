"use client";

import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface DeepResearchProgressProps {
  percent: number;
  currentStep?: string;
  agent?: string;
  className?: string;
  tree?: {
    nodeCount?: number;
    maxDepth?: number;
    nodesWithFindings?: number;
  };
}

export function DeepResearchProgress({ 
  percent, 
  currentStep = "Researching...", 
  agent,
  className,
  tree
}: DeepResearchProgressProps) {
  // Ensure percent is a number and clamp it between 0 and 100
  const normalizedPercent = Math.min(Math.max(Number(percent) || 0, 0), 100);

  return (
    <div className={cn("bg-white/5 p-4 rounded-lg space-y-3", className)}>
      {/* Progress bar and main status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <p className="text-sm text-white/80">{currentStep}</p>
          </div>
        </div>
        
        <Progress value={normalizedPercent} className="h-1 bg-white/10" />
        
        <div className="flex justify-between text-xs text-white/60">
          <span>{normalizedPercent.toFixed(0)}% complete</span>
          {agent && <span>{agent}</span>}
        </div>
      </div>
    </div>
  );
} 