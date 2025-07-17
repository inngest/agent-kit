import 'dotenv/config';
import { createAgent, openai } from '@inngest/agent-kit';
import { provideFinalAnswerTool } from '../tools/assistant';
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
import { hitlTools } from '../tools/hitl';
import type { VoiceAssistantNetworkState } from '../index';
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
    
    Human-in-the-Loop Guidelines:
    - Use 'request_human_approval' before performing any action that could have significant consequences (sending emails, making purchases, modifying data)
    - Use 'ask_human_for_input' when you need clarification or additional information from the user
    - Use 'notify_human_and_wait' for important notifications that require acknowledgment
    - Always respect the human's decision if they deny approval
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
        // HITL tools
        ...hitlTools,
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
    })
});

export { assistant }