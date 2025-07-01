import 'dotenv/config';
import { createAgent, openai } from '../agentkit-dist';
import {
    manageMemoriesTool,
    recallMemoriesTool,
} from '../tools/memory';
import type { VoiceAssistantNetworkState } from '../index';


const memoryRetriever = createAgent<VoiceAssistantNetworkState>({
    name: 'memory-retriever-agent',
    description: 'Retrieves relevant memories based on the user query.',
    system: `
    You are a memory retrieval specialist. Your only job is to use the 'recall_memories' tool.
    Based on the user's input, generate a list of concise and targeted search queries to find the most relevant memories.
    `,
    tools: [recallMemoriesTool],
    model: openai({
        model: 'gpt-4o',
    }),
});

const memoryManager = createAgent<VoiceAssistantNetworkState>({
    name: 'memory-manager-agent',
    description: 'Reflects on the conversation and updates memories.',
    system: `
    You are an assistant with a dynamic, reflective memory. Your task is to maintain the accuracy of the memory store.
    Analyze the entire conversation history: the initial user query, the retrieved memories, and the assistant's final answer.

    Based on this complete context, you MUST use the 'manage_memories' tool to perform any necessary memory operations.
    You can perform creations, updates, and deletions in a single action.
    - **Update**: If the conversation reveals a direct contradiction or provides a correction to an existing memory, add it to the 'updates' list.
    - **Delete**: If a memory is proven to be irrelevant or incorrect, add an object with its ID and content to the 'deletions' list.
    - **Create**: If the conversation introduces significant new information about the user that does not conflict with existing memories, add it to the 'creations' list.
    - **Do Nothing**: If no changes are needed, do not call the tool.

    Your goal is to ensure the memory is a reliable and accurate reflection of the user.
    `,
    tools: [manageMemoriesTool],
    tool_choice: 'manage_memories',
    model: openai({
        model: 'gpt-4o',
    }),
});

export { memoryRetriever, memoryManager };