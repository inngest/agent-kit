// custom tools that the user made for their personal assistant
// for now just going to make an "answer_tool" - will add more later

import { createTool } from '../agentkit-dist';
import { z } from 'zod';
import type { VoiceAssistantNetworkState } from '../index';

const params = z.object({
    answer: z.string().describe("The final answer to the user's question."),
});

const provideFinalAnswerTool = createTool<typeof params, VoiceAssistantNetworkState>({
    name: 'provide_final_answer',
    description: 'Provide the final, synthesized answer to the user.',
    parameters: params,
    handler: async ({ answer }, { network }) => {
        network.state.data.assistantAnswer = answer;
        return { success: true, answer };
    },
});

export { provideFinalAnswerTool };