import 'dotenv/config';
import { createTool } from '@inngest/agent-kit';
import { z } from 'zod';
import { Memory } from 'mem0ai/oss';
import { Inngest } from 'inngest';

const MIN_RECALL_QUERIES = 3;
const MAX_RECALL_QUERIES = 5;
const TOP_K_RECALL = 5;
const MAX_UPDATE_OPERATIONS = 10;
const MAX_DELETE_OPERATIONS = 10;

const inngest = new Inngest({ id: "mem0-agent-app" });

// --- Mem0 Client ---
const mem0 = new Memory({
    vectorStore: {
        provider: "qdrant",
        config: {
            collectionName: "agent-kit-memories",
            url: "http://localhost:6333",
            // The default embedding model is text-embedding-3-small which has 1536 dimensions.
            dimension: 1536,
        },
    },
});

const addMemoriesFn = inngest.createFunction(
    { id: 'add-memories' },
    { event: 'app/memories.create' },
    async ({ event }) => {
        const { statements } = event.data as { statements: string[] };
        await mem0.add(
            statements.map((s: string) => ({ role: 'user', content: s })),
            { userId: 'default-user' }
        );
        console.log(`Added ${statements.length} memories.`);
        return { status: `Added ${statements.length} memories.` };
    }
);

const updateMemoriesFn = inngest.createFunction(
    { id: 'update-memories' },
    { event: 'app/memories.update' },
    async ({ event }) => {
        const { updates } = event.data as { updates: { id: string, statement: string }[]};
        await Promise.all(
            updates.map(update => mem0.update(update.id, update.statement))
        );
        console.log(`Updated ${updates.length} memories.`);
        return { status: `Updated ${updates.length} memories.` };
    }
);

const deleteMemoriesFn = inngest.createFunction(
    { id: 'delete-memories' },
    { event: 'app/memories.delete' },
    async ({ event }) => {
        const { deletions } = event.data as { deletions: { id: string, content?: string }[] };
        await Promise.all(
            deletions.map(deletion => mem0.delete(deletion.id))
        );
        console.log(`Deleted ${deletions.length} memories.`);
        return { status: `Deleted ${deletions.length} memories.` };
    }
);

// --- Tools ---
const createMemoriesTool = createTool({
    name: 'create_memories',
    description: 'Save one or more new pieces of information to memory.',
    parameters: z.object({
        statements: z.array(z.string()).describe('The pieces of information to memorize.'),
    }),
    handler: async ({ statements }, { step }) => {
        await step?.sendEvent('send-create-memories-event', {
            name: 'app/memories.create',
            data: {
                statements,
            }
        });
        return `I have scheduled the creation of ${statements.length} new memories. They will be saved in the background.`;
    },
});

const recallMemoriesTool = createTool({
    name: 'recall_memories',
    description: `Recall memories relevant to one or more queries.
    Returns a list of memories with their IDs for each query. Can run up to ${MAX_RECALL_QUERIES} queries in parallel. Requires at least ${MIN_RECALL_QUERIES} query.
    Make sure to strategically curate multiple queries as needed - each of them should be different and help find the most relevant information needed to address the user's query`,
    parameters: z.object({
        queries: z.array(z.string())
            .min(MIN_RECALL_QUERIES)
            .describe(`The questions to ask your memory to find relevant information. Must provide between ${MIN_RECALL_QUERIES} and ${MAX_RECALL_QUERIES} queries.`),
    }),
    handler: async ({ queries }, { step }) => {
        const cappedQueries = queries.slice(0, MAX_RECALL_QUERIES);

        const searchResults = await Promise.all(
            cappedQueries.map(query =>
                step?.run(`search-memory: ${query}`, async () => {
                    const res = await mem0.search(query, { userId: 'default-user', limit: TOP_K_RECALL });
                    const uniqueResults = res.results.map((r: any) => ({ id: r.id, memory: r.memory }));
                    return { query, results: uniqueResults };
                })
            )
        );

        if (!searchResults) {
            return {
                error: "Could not perform memory search.",
                memories_found: 0,
                memories: [],
            };
        }

        // Collect all memories from all queries and deduplicate by ID
        const allMemoriesFlat = searchResults.flatMap(searchResult => 
            searchResult?.results || []
        );

        // Deduplicate by memory ID
        const uniqueMemories = Array.from(
            new Map(allMemoriesFlat.map(mem => [mem.id, mem])).values()
        );

        if (uniqueMemories.length === 0) {
            return {
                memories_found: 0,
                memories: [],
                message: "I don't have any memories that match your queries."
            };
        }

        return {
            memories_found: uniqueMemories.length,
            memories: uniqueMemories
        };
    },
});

const updateMemoriesTool = createTool({
    name: 'update_memories',
    description: `Update one or more existing memories. Can run up to ${MAX_UPDATE_OPERATIONS} updates in parallel. Make sure to carefully consider whether a memory should be updated or if a new memory should be created.
    For example, if you have a memory like this: "User loves to eat pizza".
    And if the user later in a discussion mentions that they love to eat hamburgers,
    You might not want to update the previous memory related to pizza because that user may enjoy MANY things to eat - not just pizza.
    Therefore, in this scenario, you would create a new memory like: "User loves to eat hamburgers"
    `,
    parameters: z.object({
        updates: z.array(z.object({
            id: z.string().describe("The unique ID of the memory to update."),
            statement: z.string().describe("The new, corrected information to save."),
        })).describe(`An array of memories to update. Max ${MAX_UPDATE_OPERATIONS} updates.`),
    }),
    handler: async ({ updates }, { step }) => {
        const cappedUpdates = updates.slice(0, MAX_UPDATE_OPERATIONS);
        await step?.sendEvent('send-update-memories-event', {
            name: 'app/memories.update',
            data: {
                updates: cappedUpdates,
            }
        });
        return `I have scheduled the update of ${cappedUpdates.length} memories. They will be updated in the background.`;
    }
});

const deleteMemoriesTool = createTool({
    name: 'delete_memories',
    description: `Delete one or more existing memories. Can run up to ${MAX_DELETE_OPERATIONS} deletions in parallel.
    For each memory to delete, you must provide its unique ID. You can optionally provide the memory's content for context.
    If the user is asking you to delete a memory but if the memory is not readily available
    (or if the memory itself is unrelated to what the user is asking you to delete), then do not delete that memory.`,
    parameters: z.object({
        deletions: z.array(z.object({
            id: z.string().describe("The unique ID of the memory to delete."),
            content: z.string().optional().describe("The content of the memory being deleted."),
        })).describe(`The memories to delete. Max ${MAX_DELETE_OPERATIONS} deletions.`),
    }),
    handler: async ({ deletions }, { step }) => {
        const cappedDeletions = deletions.slice(0, MAX_DELETE_OPERATIONS);
        await step?.sendEvent('send-delete-memories-event', {
            name: 'app/memories.delete',
            data: {
                deletions: cappedDeletions,
            }
        });
        return `I have scheduled the deletion of ${cappedDeletions.length} memories. They will be deleted in the background.`;
    }
});

const manageMemoriesTool = createTool({
    name: 'manage_memories',
    description: `Create, update, and/or delete memories in a single atomic operation. This is the preferred way to modify memories.
    You can provide a list of new statements to create, a list of existing memories to update with new statements, and a list of memories to delete.
    Any combination of these operations is valid.`,
    parameters: z.object({
        creations: z.array(z.string()).optional().describe('A list of new statements to save as memories.'),
        updates: z.array(z.object({
            id: z.string().describe("The unique ID of the memory to update."),
            statement: z.string().describe("The new, corrected information to save."),
        })).optional().describe(`A list of memories to update. Max ${MAX_UPDATE_OPERATIONS} updates.`),
        deletions: z.array(z.object({
            id: z.string().describe("The unique ID of the memory to delete."),
            content: z.string().optional().describe("The content of the memory being deleted."),
        })).optional().describe(`A list of memories to delete. Max ${MAX_DELETE_OPERATIONS} deletions.`),
    }),
    handler: async ({ creations, updates, deletions }, { step }) => {
        const summary: string[] = [];

        if (creations && creations.length > 0) {
            await step?.sendEvent('create-memories', {
                name: 'app/memories.create',
                data: {
                    statements: creations,
                }
            });
            summary.push(`Created ${creations.length} memories`);
        }
        if (updates && updates.length > 0) {
            const cappedUpdates = updates.slice(0, MAX_UPDATE_OPERATIONS);
            await step?.sendEvent('update-memories', {
                name: 'app/memories.update',
                data: {
                    updates: cappedUpdates,
                }
            });
            summary.push(`Updated ${cappedUpdates.length} memories`);
        }
        if (deletions && deletions.length > 0) {
            const cappedDeletions = deletions.slice(0, MAX_DELETE_OPERATIONS);
            await step?.sendEvent('delete-memories', {
                name: 'app/memories.delete',
                data: {
                    deletions: cappedDeletions,
                }
            });
            summary.push(`Deleted ${cappedDeletions.length} memories`);
        }

        if (summary.length === 0) {
            return "No memory operations were scheduled.";
        }

        return `Scheduled memory operations: ${summary.join('; ')}. They will be processed in the background.`;
    },
});

export {
    createMemoriesTool,
    recallMemoriesTool,
    updateMemoriesTool,
    deleteMemoriesTool,
    addMemoriesFn,
    updateMemoriesFn,
    deleteMemoriesFn,
    manageMemoriesTool,
}