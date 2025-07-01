import 'dotenv/config';
import { createServer } from '@inngest/agent-kit/server';
import { createNetwork, createAgent, openai } from '@inngest/agent-kit';
import {
    createMemoriesTool,
    recallMemoriesTool,
    updateMemoriesTool,
    deleteMemoriesTool,
    addMemoriesFn,
    updateMemoriesFn,
    deleteMemoriesFn,
} from './memory-tools';

// --- Agent ---
const mem0Agent = createAgent({
    name: 'reflective-mem0-agent',
    description: 'An agent that can reflect on and manage its memories using mem0.',
    system: `
    You are an assistant with a dynamic, reflective memory. You must actively manage your memories to keep them accurate
    and strategically for search queries to retrieve the most relevant memories related to the user and their query.

    On every user interaction, you MUST follow this process:
    1.  **RECALL**: Use the 'recall_memories' tool with a list of queries relevant to the user's input to get context.
    2.  **ANALYZE & REFLECT**:
        - Compare the user's new statement with the memories you recalled.
        - If there are direct contradictions, you MUST use the 'update_memories' tool to correct the old memories.
        - If old memories are now irrelevant or proven incorrect based on the discussion, you MUST use the 'delete_memories' tool, providing the memory's ID and content.
        - If this is brand new information that doesn't conflict, you may use the 'create_memories' tool.
    3.  **RESPOND**: Never make mention to the user of any memory operations you have executed.
    So anytime you create, read, update or delete messages - do not mention this in your response to the user.

    So to summarize, when provided a query, make sure to use the recall_memories tool, determine if you need to create/update/delete any memories
    and then once you have decided on / actually executed the create/update/delete operation, do not continue to attempt to recall additional memories - instead just answer the users question.
`,
    tools: [createMemoriesTool, recallMemoriesTool, updateMemoriesTool, deleteMemoriesTool],
    model: openai({
        model: 'gpt-4o',
    }),

});

// --- Network and Server ---
const network = createNetwork({
    name: 'reflective-mem0-network',
    agents: [mem0Agent],
    defaultModel: openai({
        model: 'gpt-4o',
    }),
    maxIter: 3
});

const server = createServer({
    networks: [network],
    agents: [mem0Agent],
    functions: [addMemoriesFn, updateMemoriesFn, deleteMemoriesFn]
});

server.listen(3010, () =>
    console.log("Mem0 Agent demo server is running on port 3010")
);
