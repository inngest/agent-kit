import 'dotenv/config';
import * as crypto from 'crypto';
import { createAgent, openai, AgentResult, type ToolResultMessage, type ToolMessage, getStepTools } from '@inngest/agent-kit';
import { provideFinalAnswerTool } from '../tools/assistant';
import { requiresApproval } from '../config/tool-approval-policy';
import { PostgresHistoryAdapter } from '../db';
import { historyConfig } from '../config/db';
import { voiceAssistantChannel, type VoiceAssistantNetworkState } from '../index';
import {
    geocodeTool,
    reverseGeocodeTool,
    searchPlacesTool,
    placeDetailsTool,
    distanceMatrixTool,
    directionsTool 
} from '../tools/maps';
import { 
    macTranscribeAudio,
    getTodaysEvents,
    searchCalendarEvents,
    createCalendarEvent,
    createReminder,
    getReminders,
    createNote,
    searchNotes,
    getNotes,
    getUnreadEmails,
    sendEmail,
    sendMessage,
    findContact
} from '../tools/macbook';

import { createSmitheryUrl } from "@smithery/sdk/shared/config.js"
import { anthropic } from 'inngest';

// const notionServer = createSmitheryUrl("https://server.smithery.ai/@smithery/notion", {
//     config: { "notionApiKey": process.env.NOTION_API_KEY },
//     apiKey: process.env.SMITHERY_API_KEY
// })

// const notionConfig = {
//   "openapiMcpHeaders": `{\"Authorization\":\"Bearer ${process.env.NOTION_API_KEY}\",\"Notion-Version\":\"2022-06-28\"}`
// }
// const notionServer = createSmitheryUrl("https://server.smithery.ai/@makenotion/notion-mcp-server", { config: notionConfig, apiKey: process.env.SMITHERY_API_KEY})

const assistant = createAgent<VoiceAssistantNetworkState>({
    name: 'personal-assistant-agent',
    description: 'A helpful personal assistant that answers user questions.',
    system: ({ network }) => {
        const now = new Date();
        const year = now.getFullYear();
        const date = now.toLocaleDateString();
        const time = now.toLocaleTimeString();

        let prompt = `
    You are a helpful personal assistant.
    The current year is ${year}, the current date is ${date}, and the current time is ${time}.
    Answer the user's question based on the conversation history and any retrieved memories provided.

    You have access to a suite of Google Maps tools to help with location-based queries. Use them when appropriate to answer questions about locations, directions, and places.

    Here are the available map tools and when to use them:
    - \`maps_geocode\`: To get the latitude and longitude for a given address.
    - \`maps_reverse_geocode\`: To find an address from latitude and longitude coordinates.
    - \`maps_search_places\`: To search for places like restaurants, parks, or businesses. You can search by a query and optionally provide a location to search near.
    - \`maps_place_details\`: To get more information about a specific place using its \`place_id\`. You can get a place_id from \`maps_search_places\` or \`maps_geocode\`.
    - \`maps_distance_matrix\`: To calculate the travel distance and time between one or more origins and destinations. You can specify the mode of travel (driving, walking, etc.).
    - \`maps_directions\`: To get step-by-step directions between an origin and a destination.

    You also have access to powerful macOS integration tools:
    
    Calendar Management:
    - \`get_todays_events\`: View all calendar events scheduled for today
    - \`search_calendar_events\`: Search for events by keyword within a date range
    - \`create_calendar_event\`: Create new calendar events with title, time, location, and notes
    
    Reminders & Tasks:
    - \`create_reminder\`: Create reminders with optional due dates and notes
    - \`get_reminders\`: View reminders from specific lists or all lists
    
    Notes:
    - \`create_note\`: Create new notes in Apple Notes
    - \`search_notes\`: Search through notes by title or content
    - \`get_notes\`: List notes from specific folders or all notes
    
    Communication:
    - \`get_unread_emails\`: Check unread emails from Mail app
    - \`send_email\`: Compose and send emails
    - \`send_message\`: Send iMessages or SMS
    - \`find_contact\`: Look up contact information by name
    
    Voice Transcription:
    - \`transcribe_audio\`: Start voice transcription (opens Superwhisper or similar app)

    Use notion tools to read, update and create documents in my personal notion account.

    Use Exa web search tool to search the web for the latest information on any given subject matter
    including events, similar issues, research topics to help answer a user's query, etc.

    Be concise and helpful. Do not mention the process of retrieving or storing memories.
    If you no longer need to use any tools to form an answer/perform research, use the 'provide_final_answer' tool to give your final response to the user (after you've used all tools needed to address their query)
    You should prefer to use tools instead of assuming you have all the up to date information on something. 
    Anytime you are asked to search for a location or directions, use our maps-related tools before using the 'provide_final_answer' tool.

    You should only use the "provide_final_answer" tool if no other tools need to be invoked. Do not make multiple tool calls, including the "provide_final_answer" tool at the same time.
    Call the "provide_final_answer" tool only once, after you've used all tools needed to address their query.
    Always call the "provide_final_answer" tool after you've used all other tools needed to address the users query.
    Do not assume that you have my approval to respond back to emails or send text messages unless I have explicitly given you instructions to do so.
    `;

        if (network?.state.data.transcriptionInProgress) {
            prompt += `
      The 'transcribe_audio' tool has already been used and transcription is in progress.
      Do not use the 'transcribe_audio' tool again in this conversation.
      Inform the user that transcription has started and provide a final answer.
      `;
        }

        return prompt;
    },
    tools: [
        // Maps tools
        geocodeTool, 
        reverseGeocodeTool, 
        searchPlacesTool, 
        distanceMatrixTool, 
        placeDetailsTool, 
        directionsTool,
        // macOS tools
        macTranscribeAudio,
        getTodaysEvents,
        searchCalendarEvents,
        createCalendarEvent,
        createReminder,
        getReminders,
        createNote,
        searchNotes,
        getNotes,
        getUnreadEmails,
        sendEmail,
        sendMessage,
        findContact,
        // Final answer tool
        provideFinalAnswerTool
    ],
    mcpServers: [
        // {
        //     name: "notion",
        //     transport: {
        //         type: "streamable-http",
        //         url: notionServer.toString(),
        //     },
        // },
        {
            name: "notion",
            transport: {
                type: "stdio",
                command: "npx",
                args: ["-y", "@notionhq/notion-mcp-server"],
                env: {
                  "OPENAPI_MCP_HEADERS": `{\"Authorization\":\"Bearer ${process.env.NOTION_API_KEY}\",\"Notion-Version\":\"2022-06-28\"}`
                }
            },
        },
        {
            name: "exa_web_search",
            transport: {
                type: "stdio",
                command: "npx",
                args: [
                    "-y",
                    "mcp-remote",
                    `https://mcp.exa.ai/mcp?exaApiKey=${process.env.EXA_API_KEY}`
                ]
            }
        }
    ],
    model: anthropic({
        model: "claude-3-5-sonnet-latest",
        defaultParameters: {
            max_tokens: 6000
        }
    }),
    lifecycle: {
        async onResponse({ agent, result, network }): Promise<AgentResult> {
            console.log(`🔍 [Assistant Lifecycle] onResponse called for agent: ${agent.name}`);
            
            // 1. Find all tool calls in the agent's proposed response
            const allToolCalls = result.output.flatMap((message) =>
                message.type === "tool_call" ? message.tools : []
            );

            if (allToolCalls.length === 0) {
                console.log(`✅ [Assistant Lifecycle] No tool calls found, proceeding without approval`);
                return result; // No tool calls, proceed normally
            }

            // 2. Filter to find which ones require approval based on our policy
            const callsToApprove = allToolCalls.filter((toolCall) =>
                requiresApproval(toolCall.name)
            );

            if (callsToApprove.length === 0) {
                console.log(`✅ [Assistant Lifecycle] No sensitive tools found in ${allToolCalls.length} tool calls, proceeding without approval`);
                return result; // No sensitive tools, proceed normally
            }

            console.log(`🚨 [Assistant Lifecycle] Found ${callsToApprove.length} sensitive tools requiring approval: ${callsToApprove.map(t => t.name).join(', ')}`);

            // Get step tools for durable execution
            const step = await getStepTools();
            if (!step) {
                console.error(`❌ [Assistant Lifecycle] Step context not available for approval workflow`);
                throw new Error('Tool approval requires Inngest step context but none was provided');
            }

            // 3. Send SSE to CLI and wait for user response (simplified approach)
            const approvalId = crypto.randomUUID();
            const approvalEventId = `approval-${approvalId}`;
            
            // Save pending approval to database for persistence
            if (network?.state.threadId) {
                await step.run("save-pending-approval", async () => {
                    const historyAdapter = new PostgresHistoryAdapter<VoiceAssistantNetworkState>(historyConfig);
                    await historyAdapter.savePendingApproval({
                        approvalId: approvalId,
                        threadId: network.state.threadId!,
                        waitForEventId: approvalEventId,
                        toolCalls: callsToApprove.map((c) => ({
                            toolName: c.name,
                            toolInput: c.input,
                            toolCallId: c.id,
                        })),
                        status: "pending",
                        createdAt: new Date(),
                        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min timeout
                    });
                    await historyAdapter.close();
                });
            }
            
            // Send HITL request event via Inngest
            if (step && network) {
                const sessionId = network.state.data.sessionId!;
                
                // Create the HITL request data with toolCalls included
                const hitlRequestData = {
                    messageId: approvalEventId,
                    agentName: agent.name,
                    request: `Approve execution of ${callsToApprove.length} sensitive tool(s)`,
                    expiresAt: new Date(Date.now() + 30000),
                    timestamp: new Date(),
                    toolCalls: callsToApprove.map(call => ({
                        toolName: call.name,
                        toolInput: call.input
                    }))
                };
                
                console.log(`[DEBUG] Sending HITL request event for session: ${sessionId}`);
                console.log('[DEBUG] HITL event data:', hitlRequestData);
                
                // Send an Inngest event that will be handled by a separate function
                // which has access to the realtime publish capability
                await step.sendEvent("send-hitl-to-cli", {
                    name: 'app/realtime.hitl.request',
                    data: {
                        sessionId,
                        channelData: hitlRequestData
                    }
                });
                
                console.log('[DEBUG] HITL event sent to relay function');
            } else {
                console.error('[ERROR] Missing step or network context - cannot send HITL request');
            }

            console.log(`📡 [Assistant Lifecycle] Sent approval request to CLI with eventId: ${approvalEventId}`);

            // Wait for CLI response with matching eventId
            console.log(`⏳ [Assistant Lifecycle] Waiting for event 'app/hitl.approval.response' with messageId: ${approvalEventId}`);
            
            const approvalResponse = await step.waitForEvent("wait-cli-approval", {
                event: 'app/hitl.approval.response',
                timeout: '30m',
                // if: `async.data.messageId == '${approvalEventId}'`, // TODO: bring this back; temp removed due to matching issues
            });

            console.log(`✅ [Assistant Lifecycle] Received approval response:`, approvalResponse ? JSON.stringify(approvalResponse, null, 2) : 'null (timeout)');

            // Process the response
            let approvalResults: Array<{
                originalCallId: string;
                approved: boolean;
                reason?: string;
            }> = [];

            if (approvalResponse?.data.approved) {
                // User approved - allow all tools
                approvalResults = callsToApprove.map(call => ({
                    originalCallId: call.id,
                    approved: true,
                    reason: 'Approved by user'
                }));
                console.log(`✅ [Assistant Lifecycle] User approved ${callsToApprove.length} sensitive tools`);
            } else {
                // User denied or timeout - deny all tools
                const reason = approvalResponse ? 'Denied by user' : 'Approval timeout';
                approvalResults = callsToApprove.map(call => ({
                    originalCallId: call.id,
                    approved: false,
                    reason
                }));
                console.log(`❌ [Assistant Lifecycle] ${reason} for ${callsToApprove.length} sensitive tools`);
            }

            // Update database with resolution
            if (network?.state.threadId) {
                await step.run("resolve-pending-approval", async () => {
                    const historyAdapter = new PostgresHistoryAdapter<VoiceAssistantNetworkState>(historyConfig);
                    await historyAdapter.resolvePendingApproval({
                        waitForEventId: approvalEventId,
                        status: approvalResponse?.data.approved ? "approved" : "denied",
                        resolvedAt: new Date(),
                        resolvedBy: approvalResponse?.data.userId || 'user',
                    });
                    await historyAdapter.close();
                });
            }

            console.log(`📋 [Assistant Lifecycle] Received approval results:`, approvalResults);

            // 4. Process approval results and modify the agent response accordingly
            const deniedToolResults: ToolResultMessage[] = [];
            result.output = result.output
                .map((message) => {
                    if (message.type === "tool_call") {
                        // Separate approved from denied tools
                        const approvedTools: ToolMessage[] = [];
                        message.tools.forEach((tool) => {
                            const approval = approvalResults.find(
                                (res: { originalCallId: string; approved: boolean; reason?: string }) => res.originalCallId === tool.id
                            );
                            
                            if (approval?.approved) {
                                approvedTools.push(tool);
                                console.log(`✅ [Assistant Lifecycle] Tool '${tool.name}' was approved`);
                            } else if (approval && !approval.approved) {
                                // Create a "denied" tool result for conversation continuity
                                const reason = approval.reason || 'Access denied by user';
                                deniedToolResults.push({
                                    role: "tool_result" as const,
                                    type: "tool_result" as const,
                                    tool: {
                                        type: "tool" as const,
                                        id: tool.id,
                                        name: tool.name,
                                        input: tool.input,
                                    },
                                    content: {
                                        error: `Access denied: The tool '${tool.name}' requires approval and was not permitted. Reason: ${reason}`,
                                    },
                                    stop_reason: "tool" as const,
                                });
                                console.log(`❌ [Assistant Lifecycle] Tool '${tool.name}' was denied: ${reason}`);
                            }
                        });
                        message.tools = approvedTools;
                    }
                    return message;
                })
                // Remove any tool_call messages that are now empty
                .filter((m) => m.type !== "tool_call" || m.tools.length > 0);

            // 5. Add the denied tool results to maintain conversation continuity
            result.output = [...result.output, ...deniedToolResults];

            console.log(`🏁 [Assistant Lifecycle] Policy enforcement complete. Approved: ${approvalResults.filter((r: { approved: boolean }) => r.approved).length}, Denied: ${approvalResults.filter((r: { approved: boolean }) => !r.approved).length}`);
            
            return result;
        }
    }
});

export { assistant }