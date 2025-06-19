"use client";

import { Sliders } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ResearchConfiguration {
  maxDepth: number;
  maxBreadth: number;
  stageCount: number;
  queriesPerStage: number;
}

interface ResearchConfigurationProps {
  configuration: ResearchConfiguration;
  onConfigurationChange: (config: ResearchConfiguration) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const CONFIG_LIMITS = {
  maxDepth: { min: 1, max: 3, default: 2, label: "Tree Depth" },
  maxBreadth: { min: 2, max: 5, default: 3, label: "Nodes per Level" },
  stageCount: { min: 1, max: 5, default: 3, label: "Research Stages" },
  queriesPerStage: { min: 1, max: 5, default: 3, label: "Queries per Stage" }
};

export function ResearchConfiguration({
  configuration,
  onConfigurationChange,
  isExpanded,
  onToggleExpand
}: ResearchConfigurationProps) {
  const handleChange = (key: keyof ResearchConfiguration, value: number) => {
    const limits = CONFIG_LIMITS[key];
    const clampedValue = Math.min(Math.max(value, limits.min), limits.max);
    onConfigurationChange({
      ...configuration,
      [key]: clampedValue
    });
  };

  return (
    <DropdownMenu open={isExpanded} onOpenChange={onToggleExpand}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 py-2 px-3 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-colors"
        >
          <Sliders size={14} className="rotate-90" />
          <span>Research Settings</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 p-4 space-y-4"
      >
        {(Object.keys(CONFIG_LIMITS) as Array<keyof typeof CONFIG_LIMITS>).map((key) => (
          <div key={key} className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {CONFIG_LIMITS[key].label}
              </label>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {configuration[key]}
              </span>
            </div>
            <input
              type="range"
              min={CONFIG_LIMITS[key].min}
              max={CONFIG_LIMITS[key].max}
              value={configuration[key]}
              onChange={(e) => handleChange(key, parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>{CONFIG_LIMITS[key].min}</span>
              <span>{CONFIG_LIMITS[key].max}</span>
            </div>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 