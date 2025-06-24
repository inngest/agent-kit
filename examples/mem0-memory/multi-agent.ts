import 'dotenv/config';
import { createServer } from '@inngest/agent-kit/server';
import { createNetwork, createAgent, openai, type Agent } from '@inngest/agent-kit';
import {
    addMemoriesFn,
    deleteMemoriesFn,
    manageMemoriesTool,
    recallMemoriesTool,
    updateMemoriesFn,
} from './memory-tools';

// --- Agents ---

// 1. Memory Retrieval Agent
const memoryRetrievalAgent = createAgent({
    name: 'memory-retrieval-agent',
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

// 2. Personal Assistant Agent
const personalAssistantAgent = createAgent({
    name: 'personal-assistant-agent',
    description: 'A helpful personal assistant that answers user questions.',
    system: `
    You are a helpful personal assistant.
    Answer the user's question based on the conversation history and any retrieved memories provided.
    Be concise and helpful. Do not mention the process of retrieving or storing memories.
    `,
    // This agent has no tools, it only synthesizes an answer.
    model: openai({
        model: 'gpt-4o',
    }),
});

// 3. Memory Updater Agent
const memoryUpdaterAgent = createAgent({
    name: 'memory-updater-agent',
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
    model: openai({
        model: 'gpt-4o',
    }),
});

// --- Network and Server ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const multiAgentMemoryNetwork = createNetwork({
    name: 'multi-agent-memory-network',
    agents: [memoryRetrievalAgent, personalAssistantAgent, memoryUpdaterAgent],
    defaultModel: openai({
        model: 'gpt-4o',
    }),
    maxIter: 3,
    router: async ({ callCount, network }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agents = network.agents as Map<string, Agent<any>>;
        if (callCount === 0) {
            // 1. First, always run the retrieval agent.
            return memoryRetrievalAgent;
        }
        if (callCount === 1) {
            // 2. Second, run the personal assistant.
            return personalAssistantAgent;
        }
        if (callCount === 2) {
            // 3. Third, run the memory updater.
            return memoryUpdaterAgent;
        }
        // After the third agent, we are done.
        return undefined;
    },
});

const server = createServer({
    networks: [multiAgentMemoryNetwork],
    functions: [addMemoriesFn, updateMemoriesFn, deleteMemoriesFn],
});

server.listen(3010, () =>
    console.log("Multi-Agent Mem0 demo server is running on port 3010")
);
