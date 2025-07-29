import 'dotenv/config';
import { createServer } from '@inngest/agent-kit/server';
import { Inngest } from 'inngest';
import { realtimeMiddleware, channel, topic } from "@inngest/realtime";
import { z } from 'zod';
import crypto from 'crypto';
import {
    createState,
    createNetwork,
    openai
} from '@inngest/agent-kit';
import { PostgresHistoryAdapter } from './db';
import { historyConfig } from './config/db';

import { assistant } from './agents/assistant';
import { memoryRetriever, memoryManager } from './agents/memory';
import { createAddMemoriesFn, createDeleteMemoriesFn, createUpdateMemoriesFn } from './tools/memory';
import { cliApprovalHandler } from './functions/cli-approval-handler';
import { realtimeRelayFunction } from './functions/realtime-relay';

// 1. Define the network state
export interface VoiceAssistantNetworkState {
    sessionId: string;
    userInput: string;
    userId?: string; // Add userId for thread management
    retrievedMemories?: {
        memories_found: number;
        memories: { id: string, memory: string }[];
    };
    assistantAnswer?: string;
    answerPublished?: boolean;
    retrievalAttempted?: boolean;
    memoriesUpdated?: boolean;
    transcriptionInProgress?: boolean;
    results?: any[]; // Kept for legacy reasons, prefer `messages`
    messages?: any[]; // For client-authoritative history
    pendingApprovalId?: string; // Track the expected approval ID for HITL
}

// --- Singleton History Adapter Setup ---
// Instantiate the adapter once, outside the workflow
const historyAdapter = new PostgresHistoryAdapter<VoiceAssistantNetworkState>(historyConfig);
console.log("✅ Singleton PostgresHistoryAdapter created.");

// Add graceful shutdown logic
const cleanup = async () => {
    console.log("🔌 Closing history adapter connection pool...");
    await historyAdapter.close();
    process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => console.log("👋 AgentKit Voice Assistant Server shutting down."));
// --- End Singleton Setup ---


// 2. Setup Inngest client with Realtime middleware
const inngest = new Inngest({
    id: "voice-assistant-app",
    middleware: [realtimeMiddleware()],
});

// 3. Define the Realtime channel and topics
export const voiceAssistantChannel = channel((sessionId: string) => `voice-assistant.${sessionId}`)
    .addTopic(topic("agent_status").type<{ agentName: string; status: 'thinking' | 'completed' | 'error'; message?: string }>())
    .addTopic(topic("tool_usage").type<{ agentName: string; toolName: string; status: 'using' | 'completed' | 'error'; error?: string }>())
    .addTopic(topic("message").type<{ content: string; role: 'user' | 'assistant' | 'system' }>())
    .addTopic(topic("debug").type<{ level: 'info' | 'warn' | 'error'; message: string; details?: any }>())
    .addTopic(topic("system").type<{ event: 'workflow_start' | 'workflow_complete' | 'memory_operation' | 'transcription'; message: string }>())
    // New enriched event stream topics
    .addTopic(topic("thought").type<{ agentName: string; content: string; timestamp: Date }>())
    .addTopic(topic("tool_call").type<{ agentName: string; toolName: string; input: any; timestamp: Date }>())
    .addTopic(topic("tool_result").type<{ agentName: string; toolName: string; result: any; timestamp: Date }>())
    .addTopic(topic("final_message").type<{ content: string; timestamp: Date }>())
    .addTopic(topic("hitl_request").type<{ 
        messageId: string; 
        agentName: string; 
        request: string; 
        options?: string[]; 
        expiresAt: Date;
        timestamp: Date;
        toolCalls?: Array<{
            toolName: string;
            toolInput: any;
        }>;
    }>())
    .addTopic(topic("hitl_response").type<{ 
        messageId: string; 
        approved: boolean; 
        response?: string; 
        timestamp: Date 
    }>())
    .addTopic(topic("hitl_timeout").type<{ 
        messageId: string; 
        timestamp: Date 
    }>())
    .addTopic(topic("speak").type<string>());


// 4. Instantiate the memory functions
const addMemories = createAddMemoriesFn(inngest);
const updateMemories = createUpdateMemoriesFn(inngest);
const deleteMemories = createDeleteMemoriesFn(inngest);

// 5. Create the main Inngest function to orchestrate the agent workflow
const voiceAssistantWorkflow = inngest.createFunction(
    { id: 'voice-assistant-workflow', name: 'Voice Assistant Workflow' },
    { event: 'app/voice.request' },
    async ({ event, publish, step }) => {
        const workflowStart = Date.now();
        const { input, sessionId, threadId, messages } = event.data as { 
            input: string; 
            sessionId: string; 
            threadId?: string;
            messages?: any[]; // Client-provided conversation history
        };
        
        // Log Inngest execution context
        console.log(`🚀 [Workflow] Starting voice assistant workflow for session: ${sessionId}, threadId: ${threadId}, hasMessages: ${!!messages}`);
        console.log(`🚀 [Workflow] Input length: ${input.length} chars, messages count: ${messages?.length || 0}`);
        console.log(`🚀 [Workflow] Inngest context - Event ID: ${event.id || 'unknown'}, Event Name: ${event.name}`);
        console.log(`🚀 [Workflow] Process info - PID: ${process.pid}, Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        
        // Create state with client-provided messages if available (client-authoritative mode)
        const state = createState<VoiceAssistantNetworkState>(
            { 
                userInput: input, 
                sessionId,
                userId: 'default-user'
            }, 
            { 
                threadId: threadId,
                messages: messages // Pass client messages to state
            }
        );
        
        // Create a network definition with a custom state-based router
        const voiceAssistantNetwork = createNetwork<VoiceAssistantNetworkState>({
            name: "Voice Assistant Network",
            agents: [memoryRetriever, assistant, memoryManager],
            defaultModel: openai({ model: 'gpt-4o' }),
            defaultState: state,
            history: historyAdapter, // Use the singleton adapter instance
            maxIter: 40,
            router: async ({ network, callCount }) => {
                const { state } = network;
                const chan = voiceAssistantChannel(state.data.sessionId);

                // Log detailed information about what just happened if we have results
                if (network.state.results.length > 0) {
                    const lastResult = network.state.results[network.state.results.length - 1];
                    if (!lastResult) return undefined;
                    
                    // Always log when an agent completes (regardless of whether it used tools)
                    await publish(chan.agent_status({ 
                        agentName: lastResult.agentName, 
                        status: 'completed'
                    }));
                    
                    // Emit thought events for memory agents
                    if (lastResult.agentName === 'memory-retriever' || lastResult.agentName === 'memory-manager') {
                        const thoughtContent = lastResult.output
                            .filter(msg => msg.type === 'text')
                            .map(msg => msg.content)
                            .join('\n');
                        
                        if (thoughtContent) {
                            await publish(chan.thought({
                                agentName: lastResult.agentName,
                                content: thoughtContent,
                                timestamp: new Date()
                            }));
                        }
                    }
                    
                    // Log tool calls with enriched events
                    const toolCalls = lastResult.output.filter(msg => msg.type === 'tool_call');
                    if (toolCalls.length > 0) {
                        for (const toolCall of toolCalls) {
                            if (toolCall.type === 'tool_call' && Array.isArray(toolCall.tools)) {
                                for (const tool of toolCall.tools) {
                                    // Send tool call event
                                    await publish(chan.tool_call({
                                        agentName: lastResult.agentName,
                                        toolName: tool.name,
                                        input: tool.input,
                                        timestamp: new Date()
                                    }));
                                    
                                    // Legacy tool usage event for backward compatibility
                                    await publish(chan.tool_usage({
                                        agentName: lastResult.agentName,
                                        toolName: tool.name,
                                        status: 'using'
                                    }));
                                }
                            }
                        }
                    }
                    
                    // Log tool results with enriched events
                    if (lastResult.toolCalls.length > 0) {
                        for (const toolResult of lastResult.toolCalls) {
                            // Send tool result event
                            await publish(chan.tool_result({
                                agentName: lastResult.agentName,
                                toolName: toolResult.tool.name,
                                result: toolResult.content,
                                timestamp: new Date()
                            }));
                            
                            // Legacy tool usage completion event
                            await publish(chan.tool_usage({
                                agentName: lastResult.agentName,
                                toolName: toolResult.tool.name,
                                status: 'completed'
                            }));
                        }
                    }
                }

                // 1. Retrieve memories if we haven't yet.
                if (state.data.retrievedMemories === undefined) {
                    if (!state.data.retrievalAttempted) {
                        state.data.retrievalAttempted = true;
                        await publish(chan.system({ event: 'memory_operation', message: 'Checking memories...' }));
                        await publish(chan.agent_status({ agentName: 'memory-retriever', status: 'thinking' }));
                        return memoryRetriever;
                    } else {
                        // Retrieval already attempted but no memories found; proceed without memories
                        await publish(chan.agent_status({ agentName: 'memory-retriever', status: 'completed', message: 'No memory search needed' }));
                        state.data.retrievedMemories = { memories_found: 0, memories: [] };
                    }
                }

                // 2. Synthesize an answer
                if (state.data.assistantAnswer === undefined) {
                    await publish(chan.agent_status({ agentName: 'assistant', status: 'thinking' }));
                    if (callCount > 8) {
                      console.log("max call count of 8 hit! forcing final answer tool...")
                      assistant.tool_choice = "provide_final_answer"
                      await publish(chan.debug({ level: 'warn', message: 'Maximum iterations reached, forcing final answer...' }));
                      return assistant
                    }
                    return assistant;
                }
                
                // 3. Publish the answer if we have one and haven't published it yet.
                if (state.data.answerPublished === undefined) {
                    await publish(chan.agent_status({ agentName: 'assistant', status: 'completed', message: `Response: ${state.data.assistantAnswer!.substring(0, 100)}${state.data.assistantAnswer!.length > 100 ? '...' : ''}` }));
                    
                    // Emit final message event
                    await publish(chan.final_message({
                        content: state.data.assistantAnswer!,
                        timestamp: new Date()
                    }));
                    
                    // Legacy speak event for backward compatibility
                    await publish(chan.speak(state.data.assistantAnswer!));
                    state.data.answerPublished = true; // Mark as published
                }

                // 4. Update memories if we have an answer but haven't managed memories yet.
                if (state.data.memoriesUpdated === undefined) {
                    await publish(chan.system({ event: 'memory_operation', message: 'Updating memories...' }));
                    await publish(chan.agent_status({ agentName: 'memory-manager', status: 'thinking' }));
                    return memoryManager;
                }

                // 5. All steps are done.
                return undefined;
            },
        });

        console.log(`🌐 [Workflow] Network created successfully with history adapter in ${Date.now() - workflowStart}ms`);

        const chan = voiceAssistantChannel(sessionId);
        await publish(chan.system({ event: 'workflow_start', message: 'Starting voice assistant workflow...' }));
        
        console.log(`🏃 [Workflow] Starting network run after ${Date.now() - workflowStart}ms setup time`);
        
        // The network will now run agents based on the custom router logic.
        const networkResult = await voiceAssistantNetwork.run(input, { state });

        console.log(`✅ [Workflow] Network run completed in ${Date.now() - workflowStart}ms total time`);

        // Log outcomes based on the final state
        if (state.data.retrievedMemories && state.data.retrievedMemories.memories_found > 0) {
            await publish(chan.system({ event: 'memory_operation', message: `Found ${state.data.retrievedMemories.memories_found} memories.` }));
        } else {
            await publish(chan.system({ event: 'memory_operation', message: 'No relevant memories found.' }));
        }

        if (!state.data.assistantAnswer) {
            await publish(chan.debug({ level: 'error', message: 'Assistant could not provide an answer.' }));
            console.error(`❌ [Workflow] Assistant failed to provide answer after ${Date.now() - workflowStart}ms`);
            return { error: "Assistant failed to provide an answer." };
        }

        if (state.data.memoriesUpdated) {
            await publish(chan.system({ event: 'memory_operation', message: 'Memory management step complete.' }));
        } else {
            await publish(chan.system({ event: 'memory_operation', message: 'Memory management was not performed or not needed.' }));
        }

        // --- Done ---
        await publish(chan.system({ event: 'workflow_complete', message: 'Workflow complete.' }));

        console.log(`🎯 [Workflow] Workflow completed successfully in ${Date.now() - workflowStart}ms`);
        console.log(`🎯 [Workflow] Final state - Answer: ${!!state.data.assistantAnswer}, Memories: ${state.data.retrievedMemories?.memories_found || 0}, Updated: ${!!state.data.memoriesUpdated}`);

        return { finalState: state.data };
    }
);

// 7. Create the server
const server = createServer({
    client: inngest,
    functions: [
        voiceAssistantWorkflow,
        addMemories,
        updateMemories,
        deleteMemories,
        cliApprovalHandler, // Handle CLI approval responses
        realtimeRelayFunction, // Relay HITL events to realtime channel
    ],
});

server.listen(3010, () => console.log("AgentKit Voice Assistant Server running on port 3010!"));
