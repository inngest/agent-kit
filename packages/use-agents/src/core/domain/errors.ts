export const ERRORS = {
  PROVIDER_REQUIRED:
    '[AgentKit:useAgents] AgentProvider is required (requireProvider=true).',
} as const;

export type ErrorKey = keyof typeof ERRORS;

export function getError(key: ErrorKey): string {
  return ERRORS[key];
}


