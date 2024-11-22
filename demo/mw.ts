import {
  createAgent,
  createAgenticOpenAiModel,
  createNetwork,
} from "@inngest/agent-kit";
import { InngestMiddleware, openai, type OpenAi } from "inngest";

export const codeWritingNetworkMiddleware = (
  defaultModelOptions: OpenAi.AiModelOptions,
) => {
  return new InngestMiddleware({
    name: "Code Writing Agent Middleware",
    init() {
      const model = openai(defaultModelOptions);

      return {
        onFunctionRun() {
          return {
            transformInput({ ctx: { step } }) {
              const codeWritingNetwork = createNetwork({
                agents: [codeWritingAgent, executingAgent],
                maxIter: 4,
                defaultModel: createAgenticOpenAiModel({
                  model,
                  step,
                }),
              });

              return {
                ctx: {
                  ai: {
                    agents: {
                      codeWritingAgent,
                      executingAgent,
                    },
                    networks: {
                      codeWritingNetwork,
                    },
                  },
                },
              };
            },
          };
        },
      };
    },
  });
};

const codeWritingAgent = createAgent({
  name: "Code writing agent",
  description: "Writes TypeScript code and tests based off of a given input.",

  lifecycle: {
    onResponse: ({ result }) => {
      // Does this contain a solution?
      // TODO: Parse filenames out of content.
      return result;
    },
  },

  system: `You are an expert TypeScript engineer who excels at test-driven-development. Your primary focus is to take system requirements and write unit tests for a set of functions.

   Think carefully about the request that the user is asking for. Do not respond with anything else other than the following XML tags:

   - If you would like to write code, add all code within the following tags (replace $filename and $contents appropriately):

   <file name="$filename.ts">
       $contents
   </file>
   `,
});

const executingAgent = createAgent({
  name: "Test execution agent",
  description: "Executes written TypeScript tests",

  lifecycle: {
    enabled: ({ network }) => {
      // Only allow executing of tests if there are files available.
      return network?.state.kv.get("files") !== undefined;
    },
  },

  system: `You are an export TypeScript engineer that can execute commands, run tests, debug the output, and make modifications to code.

   Think carefully about the request that the user is asking for. Do not respond with anything else other than the following XML tags:

   - If you would like to write code, add all code within the following tags (replace $filename and $contents appropriately):

   <file name="$filename.ts">
       $contents
   </file>

   - If you would like to run commands, respond with the following tags:

   <command>
     $command
   </command>
   `,
});
