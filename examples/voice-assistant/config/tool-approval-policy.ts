/**
 * Tool Approval Policy Configuration
 * 
 * Defines which tools require human approval before execution.
 * This policy is enforced deterministically by the framework,
 * not by the LLM agent's decision.
 */

/**
 * List of tool names that require human approval before execution.
 * These tools are considered sensitive and could have significant consequences.
 */
export const SENSITIVE_TOOLS: string[] = [
    // Communication tools - can send messages/emails to external parties
    'send_email',
    'send_message',
    
    // Calendar and scheduling tools - can create commitments/appointments  
    'create_calendar_event',
    'create_reminder',
];

/**
 * Check if a tool name requires approval according to the policy
 */
export function requiresApproval(toolName: string): boolean {
    return SENSITIVE_TOOLS.includes(toolName);
}

/**
 * Get all sensitive tool names for display/logging purposes
 */
export function getSensitiveTools(): readonly string[] {
    return [...SENSITIVE_TOOLS];
} 