import { Inngest } from 'inngest';

// Use the same Inngest client from the main workflow
const inngest = new Inngest({
    id: "voice-assistant-app",
});

/**
 * CLI Approval Handler - Routes CLI approval responses to waiting agents
 * 
 * This function listens for approval responses from the CLI and routes them
 * to the agent waiting for that specific approval using the messageId.
 */
export const cliApprovalHandler = inngest.createFunction(
    { id: 'cli-approval-handler', name: 'CLI Approval Handler' },
    { event: 'app/cli.approval' },
    async ({ event, step }) => {
        const { messageId, approved, response, userId } = event.data as {
            messageId: string;
            approved: boolean;
            response?: string;
            userId?: string;
        };

        console.log(`📥 [CLI Approval Handler] Received ${approved ? 'approval' : 'denial'} for messageId: ${messageId}`);
        console.log('[DEBUG] Full event data:', JSON.stringify(event.data, null, 2));

        // Forward the response to the agent waiting for this specific messageId
        await step.sendEvent("forward-to-agent", {
            name: 'app/hitl.approval.response',
            data: {
                messageId,
                approved,
                response,
                userId: userId || 'cli-user',
            }
        });

        console.log(`✅ [CLI Approval Handler] Forwarded response to waiting agent for messageId: ${messageId}`);
        
        return { messageId, approved, forwarded: true };
    }
); 