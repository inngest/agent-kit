import type {
  AgentConfig,
  AgentToolPart,
  ToolName,
  ToolPartFor,
  ToolOutputOf,
  ToolDataOf,
} from "../types/index.js";

/**
 * Runtime guard that narrows an AgentToolPart to a specific tool by name.
 * No generics needed at call sites when TS can infer from arguments.
 */
export function isToolPart<C extends AgentConfig, K extends ToolName<C>>(
  part: AgentToolPart<C>,
  name: K
): part is ToolPartFor<C, K> {
  return part?.type === "tool-call" && part?.toolName === name;
}

/**
 * Runtime guard that ensures tool output is present by checking state.
 * Narrows to the branch where output is defined.
 */
export function hasToolOutput<C extends AgentConfig>(
  part: AgentToolPart<C>
): part is AgentToolPart<C> & { state: "output-available" } {
  return part?.type === "tool-call" && part?.state === "output-available";
}

/**
 * Helper that returns the flattened data for a tool part if it matches the given name
 * and has available output; otherwise returns undefined. This avoids casts in UI code.
 */
export function getToolData<C extends AgentConfig, K extends ToolName<C>>(
  part: AgentToolPart<C>,
  name: K
): ToolDataOf<C, K> | undefined {
  if (part?.type !== "tool-call") return undefined;
  if (part.toolName !== name) return undefined;
  if (part.state !== "output-available") return undefined;
  const out = part.output as ToolOutputOf<C, K> | undefined;
  const data =
    out && typeof out === "object" && "data" in out
      ? (out as { data: ToolDataOf<C, K> }).data
      : undefined;
  return data;
}

// Note: a basic isTool(part) guard already exists in root index.ts; avoid re-defining here.
