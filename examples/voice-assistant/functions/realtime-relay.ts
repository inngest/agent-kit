import { Inngest } from 'inngest';
import { realtimeMiddleware } from "@inngest/realtime";
import { voiceAssistantChannel } from '../index';

// Use the same Inngest client from the main workflow
const inngest = new Inngest({
    id: "voice-assistant-app",
    middleware: [realtimeMiddleware()],
});

/**
 * Realtime Relay Function - Publishes HITL events to the realtime channel
 * 
 * This function receives HITL events from agents and publishes them to the
 * appropriate realtime channel so the CLI can receive them.
 */
export const realtimeRelayFunction = inngest.createFunction(
    { id: 'realtime-relay', name: 'Realtime Relay for HITL' },
    { event: 'app/realtime.hitl.request' },
    async ({ event, publish }) => {
        const { sessionId, channelData } = event.data as {
            sessionId: string;
            channelData: any;
        };

        console.log(`📡 [Realtime Relay] Received HITL request for session: ${sessionId}`);

        // Get the channel for this session
        const chan = voiceAssistantChannel(sessionId);

        // Publish the HITL request to the realtime channel
        await publish(chan.hitl_request(channelData));

        console.log(`✅ [Realtime Relay] Published HITL request to channel: ${chan.name}`);
        
        return { sessionId, published: true };
    }
); 