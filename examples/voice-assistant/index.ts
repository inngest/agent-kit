import 'dotenv/config';
import { createServer } from './agentkit-dist/server';
import { Inngest } from 'inngest';
import { realtimeMiddleware, channel, topic } from "@inngest/realtime";
import { z } from 'zod';
import {
    createState,
    createNetwork,
    openai
} from './agentkit-dist';
import { PostgresHistoryAdapter } from './db';

import { assistant } from './agents/assistant';
import { memoryRetriever, memoryManager } from './agents/memory';
import { createAddMemoriesFn, createDeleteMemoriesFn, createUpdateMemoriesFn } from './tools/memory';

// 1. Define the network state
export interface VoiceAssistantNetworkState {
    sessionId: string;
    userInput: string;
    retrievedMemories?: {
        memories_found: number;
        memories: { id: string, memory: string }[];
    };
    assistantAnswer?: string;
    answerPublished?: boolean;
    retrievalAttempted?: boolean;
    memoriesUpdated?: boolean;
    transcriptionInProgress?: boolean;
}

// 2. Setup Inngest client with Realtime middleware
const inngest = new Inngest({
    id: "voice-assistant-app",
    middleware: [realtimeMiddleware()],
});

// 3. Define the Realtime channel and topics
export const voiceAssistantChannel = channel((sessionId: string) => `voice-assistant.${sessionId}`)
    .addTopic(topic("log").type<string>())
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
        const { input, sessionId } = event.data as { input: string, sessionId: string };
        
        const state = createState<VoiceAssistantNetworkState>({ userInput: input, sessionId }, { threadId: "f47ac10b-58cc-4372-a567-0e02b2c3d479" });
        const historyConfig = {
          // PostgreSQL Database Configuration
            connectionString:
              process.env.POSTGRES_URL || "postgresql://localhost:5432/agentkit_chat",
            tablePrefix: "agentkit_",
            schema: "public",
            maxTokens: 8000, 
        }
        // Create a network definition with a custom state-based router
        const voiceAssistantNetwork = createNetwork<VoiceAssistantNetworkState>({
            name: "Voice Assistant Network",
            agents: [memoryRetriever, assistant, memoryManager],
            defaultModel: openai({ model: 'gpt-4o' }),
            defaultState: state,
            // history: new PostgresHistoryAdapter({ ...historyConfig }),
            maxIter: 40,
            router: async ({ network, callCount }) => {
                const { state } = network;
                const chan = voiceAssistantChannel(state.data.sessionId);

                // Log detailed information about what just happened if we have results
                if (network.state.results.length > 0) {
                    const lastResult = network.state.results[network.state.results.length - 1];
                    if (!lastResult) return undefined;
                    
                    // Log tool calls that just happened
                    const toolCalls = lastResult.output.filter(msg => msg.type === 'tool_call');
                    if (toolCalls.length > 0) {
                        for (const toolCall of toolCalls) {
                            if (toolCall.type === 'tool_call' && Array.isArray(toolCall.tools)) {
                                for (const tool of toolCall.tools) {
                                    await publish(chan.log(`🔧 ${lastResult.agentName} called tool: ${tool.name}`));
                                    const inputStr = JSON.stringify(tool.input);
                                    if (inputStr.length < 150) {
                                        await publish(chan.log(`📥 Tool input: ${inputStr}`));
                                    } else {
                                        await publish(chan.log(`📥 Tool input: ${inputStr.substring(0, 100)}...`));
                                    }
                                }
                            }
                        }
                    }
                    
                    // Log tool results that just happened
                    if (lastResult.toolCalls.length > 0) {
                        for (const toolResult of lastResult.toolCalls) {
                            await publish(chan.log(`✅ Used '${toolResult.tool.name}' tool`));
                            
                            // Log the result content
                            let resultContent = '';
                            if (typeof toolResult.content === 'string') {
                                resultContent = toolResult.content;
                            } else if (toolResult.content && typeof toolResult.content === 'object') {
                                if ('data' in toolResult.content) {
                                    resultContent = typeof toolResult.content.data === 'string' 
                                        ? toolResult.content.data 
                                        : JSON.stringify(toolResult.content.data);
                                } else if ('error' in toolResult.content) {
                                    resultContent = `❌ Error: ${JSON.stringify(toolResult.content.error)}`;
                                } else {
                                    resultContent = JSON.stringify(toolResult.content);
                                }
                            }
                            
                            if (resultContent.length < 200) {
                                await publish(chan.log(`📤 ${resultContent}`));
                            } else {
                                await publish(chan.log(`📤 ${resultContent.substring(0, 150)}...`));
                            }
                        }
                    }
                }

                // 1. Retrieve memories if we haven't yet.
                if (state.data.retrievedMemories === undefined) {
                    if (!state.data.retrievalAttempted) {
                        state.data.retrievalAttempted = true;
                        await publish(chan.log("🔍 Checking memories..."));
                        return memoryRetriever;
                    } else {
                        // Retrieval already attempted but no memories found; proceed without memories
                        state.data.retrievedMemories = { memories_found: 0, memories: [] };
                    }
                }

                // 2. Synthesize an answer
                if (state.data.assistantAnswer === undefined) {
                    await publish(chan.log("💭 Assistant thinking..."));
                    if (callCount > 8) {
                      console.log("max call count of 8 hit! forcing final answer tool...")
                      assistant.tool_choice = "provide_final_answer"
                      await publish(chan.log("⚠️ Maximum iterations reached, forcing final answer..."));
                      return assistant
                    }
                    return assistant;
                }
                
                // 3. Publish the answer if we have one and haven't published it yet.
                if (state.data.answerPublished === undefined) {
                    await publish(chan.log(`✅ Personal assistant completed: ${state.data.assistantAnswer!.substring(0, 100)}${state.data.assistantAnswer!.length > 100 ? '...' : ''}`));
                    await publish(chan.speak(state.data.assistantAnswer!));
                    state.data.answerPublished = true; // Mark as published
                }

                // 4. Update memories if we have an answer but haven't managed memories yet.
                if (state.data.memoriesUpdated === undefined) {
                    await publish(chan.log("🔄 Updating memories..."));
                    return memoryManager;
                }

                // 5. All steps are done.
                return undefined;
            },
        });

        const chan = voiceAssistantChannel(sessionId);
        await publish(chan.log("Starting voice assistant workflow..."));

        
        
        // The network will now run agents based on the custom router logic.
        const networkResult = await voiceAssistantNetwork.run(input, { state });

        // Log outcomes based on the final state
        if (state.data.retrievedMemories && state.data.retrievedMemories.memories_found > 0) {
            await publish(chan.log(`Found ${state.data.retrievedMemories.memories_found} memories.`));
        } else {
            await publish(chan.log("No relevant memories found."));
        }

        if (!state.data.assistantAnswer) {
            await publish(chan.log("Assistant could not provide an answer."));
            return { error: "Assistant failed to provide an answer." };
        }

        if (state.data.memoriesUpdated) {
            await publish(chan.log("Memory management step complete."));
        } else {
            await publish(chan.log("Memory management was not performed or not needed."));
        }


        // --- Done ---
        await publish(chan.log("Workflow complete."));

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
    ],
});

server.listen(3010, () => console.log("AgentKit Voice Assistant Server running on port 3010!"));
