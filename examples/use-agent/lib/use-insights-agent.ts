"use client";

import {
  useAgents,
  type UseAgentsConfig,
  type UseAgentsReturn,
} from "@inngest/use-agents";

// Import the ToolManifest built from server-side tool definitions
import type { ToolManifest } from "@/app/api/inngest/functions/agents/types";

// Minimal client state used by the Insights demo
export type ClientState = {
  eventTypes?: string[];
  schemas?: Record<string, unknown> | null;
  currentQuery?: string;
  tabTitle?: string;
  mode?: "insights_sql_playground" | "demo";
  timestamp: number;
};

export function useInsightsAgent(
  config: UseAgentsConfig<ToolManifest, ClientState>
): UseAgentsReturn<ToolManifest, ClientState> {
  return useAgents<ToolManifest, ClientState>(config);
}



