// Shared TypeScript-only types for Insights agents and UI
import { createToolManifest, type StateData } from '@inngest/agent-kit';

import { selectEventsTool } from './event-matcher';
import { generateSqlTool } from './query-writer';

export type InsightsToolName = 'select_events' | 'generate_sql';

export type InsightsState = {
  // Common conversation/user context
  userId?: string;

  // Event catalog and schemas (UI-provided)
  eventTypes?: string[];
  schemas?: Record<string, unknown>;

  // Working selections and artifacts
  selectedEvents?: { event_name: string; reason: string }[];
  selectionReason?: string;
  currentQuery?: string;
  sql?: string;
};

// Agent state used by createAgent/createNetwork (extends StateData as required by AgentKit)
export type InsightsAgentState = StateData & InsightsState;

// Tool I/O (no runtime validation; types only)
export type SelectEventsInput = {
  events: {
    event_name: string;
    reason: string;
  }[];
};

export type SelectEventsResult = {
  selected: {
    event_name: string;
    reason: string;
  }[];
  reason: string;
  totalCandidates: number;
};

export type GenerateSqlInput = {
  sql: string; // single SELECT statement
  title?: string;
  reasoning?: string;
};

export type GenerateSqlResult = {
  sql: string;
  title?: string;
  reasoning?: string;
};

// Build a strongly-typed tool manifest from tool definitions - used in the UI to render tool calls
const manifest = createToolManifest([generateSqlTool, selectEventsTool] as const);

export type ToolManifest = typeof manifest;
