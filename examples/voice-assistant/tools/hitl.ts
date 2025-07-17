import { createTool } from '@inngest/agent-kit';
import { z } from 'zod';
import crypto from 'crypto';
import type { Tool } from '@inngest/agent-kit';
import type { VoiceAssistantNetworkState } from '../index';

/**
 * Request human approval for an action
 * Uses Inngest's step.waitForEvent for durable pausing
 */
export const requestHumanApprovalTool = createTool({
    name: 'request_human_approval',
    description: 'Request human approval before performing a sensitive action like sending emails, making purchases, or modifying important data',
    parameters: z.object({
        action: z.string().describe('The action that requires approval'),
        details: z.string().describe('Detailed description of what will be done'),
        options: z.array(z.string()).optional().describe('Optional list of choices for the user'),
        timeoutMinutes: z.number().default(5).describe('How many minutes to wait for approval')
    }),
    handler: async ({ action, details, options, timeoutMinutes }, { network, step }) => {
        if (!step) {
            throw new Error('Human-in-the-loop requires Inngest step context');
        }

        const messageId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
        const sessionId = (network.state.data as VoiceAssistantNetworkState).sessionId;

        // Emit HITL request event
        const chan = (await import('../index')).voiceAssistantChannel(sessionId);
        await step.sendEvent('hitl-request', {
            name: 'app/hitl.request',
            data: {
                messageId,
                agentName: 'personal-assistant-agent',
                request: action,
                details,
                options,
                expiresAt,
                timestamp: new Date()
            }
        });

        // Save pending HITL to database
        // Note: historyAdapter is not exported, so we'll skip DB persistence for now
        // This would need to be passed through the network state or tool context

        // Wait for user response with timeout
        const response = await step.waitForEvent('wait-for-approval', {
            event: 'app/hitl.response',
            match: 'data.messageId',
            timeout: `${timeoutMinutes}m`
        });

        // Check if the response matches our messageId
        if (response && response.data.messageId !== messageId) {
            return null; // Not our response
        }

        if (!response) {
            // Timeout occurred
            await step.sendEvent('hitl-timeout', {
                name: 'app/hitl.timeout',
                data: {
                    messageId,
                    timestamp: new Date()
                }
            });
            throw new Error(`Human approval timed out after ${timeoutMinutes} minutes`);
        }

        // Emit HITL response event
        await step.sendEvent('hitl-response-received', {
            name: 'app/hitl.response.received',
            data: {
                messageId,
                approved: response.data.approved,
                response: response.data.response,
                timestamp: new Date()
            }
        });

        if (!response.data.approved) {
            throw new Error(`Human denied approval: ${response.data.response || 'No reason provided'}`);
        }

        return {
            approved: true,
            response: response.data.response || 'Approved',
            approvedAt: new Date()
        };
    }
});

/**
 * Ask human for input when the agent needs clarification
 */
export const askHumanForInputTool = createTool({
    name: 'ask_human_for_input',
    description: 'Ask the human for additional information or clarification when needed',
    parameters: z.object({
        question: z.string().describe('The question to ask the human'),
        context: z.string().optional().describe('Additional context for the question'),
        suggestions: z.array(z.string()).optional().describe('Suggested responses'),
        timeoutMinutes: z.number().default(5).describe('How many minutes to wait for response')
    }),
    handler: async ({ question, context, suggestions, timeoutMinutes }, { network, step }) => {
        if (!step) {
            throw new Error('Human-in-the-loop requires Inngest step context');
        }

        const messageId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
        const sessionId = (network.state.data as VoiceAssistantNetworkState).sessionId;

        // Emit HITL request event for input
        const chan = (await import('../index')).voiceAssistantChannel(sessionId);
        await step.sendEvent('hitl-input-request', {
            name: 'app/hitl.request',
            data: {
                messageId,
                agentName: 'personal-assistant-agent',
                request: question,
                details: context || '',
                options: suggestions,
                expiresAt,
                timestamp: new Date()
            }
        });

        // Wait for user response
        const response = await step.waitForEvent('wait-for-input', {
            event: 'app/hitl.response',
            match: 'data.messageId',
            timeout: `${timeoutMinutes}m`
        });

        // Check if the response matches our messageId
        if (response && response.data.messageId !== messageId) {
            throw new Error('Received response for different message');
        }

        if (!response) {
            throw new Error(`No response received within ${timeoutMinutes} minutes`);
        }

        return {
            response: response.data.response || '',
            receivedAt: new Date()
        };
    }
});

/**
 * Notify human and wait for acknowledgment
 */
export const notifyHumanAndWaitTool = createTool({
    name: 'notify_human_and_wait',
    description: 'Notify the human about something important and wait for acknowledgment',
    parameters: z.object({
        notification: z.string().describe('The notification message'),
        severity: z.enum(['info', 'warning', 'error']).default('info'),
        requiresAcknowledgment: z.boolean().default(true),
        timeoutMinutes: z.number().default(5)
    }),
    handler: async ({ notification, severity, requiresAcknowledgment, timeoutMinutes }, { network, step }) => {
        if (!step) {
            throw new Error('Human-in-the-loop requires Inngest step context');
        }

        const messageId = crypto.randomUUID();
        const sessionId = (network.state.data as VoiceAssistantNetworkState).sessionId;

        if (!requiresAcknowledgment) {
            // Just emit notification without waiting
            const chan = (await import('../index')).voiceAssistantChannel(sessionId);
            await step.sendEvent('notification', {
                name: 'app/notification',
                data: {
                    messageId,
                    notification,
                    severity,
                    timestamp: new Date()
                }
            });
            return { acknowledged: false };
        }

        // Emit HITL request for acknowledgment
        const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
        const chan = (await import('../index')).voiceAssistantChannel(sessionId);
        await step.sendEvent('hitl-notify-request', {
            name: 'app/hitl.request',
            data: {
                messageId,
                agentName: 'personal-assistant-agent',
                request: `Acknowledge: ${notification}`,
                details: notification,
                options: ['Acknowledge', 'Dismiss'],
                expiresAt,
                timestamp: new Date()
            }
        });

        // Wait for acknowledgment
        const response = await step.waitForEvent('wait-for-ack', {
            event: 'app/hitl.response',
            match: 'data.messageId',
            timeout: `${timeoutMinutes}m`
        });

        // Check if the response matches our messageId
        if (response && response.data.messageId !== messageId) {
            return { acknowledged: false };
        }

        return {
            acknowledged: !!response,
            acknowledgedAt: response ? new Date() : undefined
        };
    }
});

// Export all HITL tools
export const hitlTools = [
    requestHumanApprovalTool,
    askHumanForInputTool,
    notifyHumanAndWaitTool
]; 