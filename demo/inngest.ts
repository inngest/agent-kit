/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  agenticOpenai,
  createAgent,
  createNetwork,
  createTypedTool,
  defaultRoutingAgent,
} from "@inngest/agent-kit";
import { EventSchemas, Inngest } from "inngest";
import { z } from "zod";

export const inngest = new Inngest({
  id: "agents",
  schemas: new EventSchemas().fromZod({
    "agent/run": {
      data: z.object({
        input: z.string(),
      }),
    },
  }),
});

export const fn = inngest.createFunction(
  { id: "agent" },
  { event: "agent/run" },
  async ({ event, step }) => {
    const model = agenticOpenai({ model: "gpt-4", step });

    // 1. Single agents
    //
    // Run a single agent as a prompt without a network.
    const { output, raw } = await codeWritingAgent.run(event.data.input, {
      model,
    });

    // 2. Networks of agents
    const cheapModel = agenticOpenai({ model: "gpt-3.5-turbo", step });

    const network = createNetwork({
      agents: [
        codeWritingAgent.withModel(model),
        executingAgent.withModel(cheapModel),
      ],
      defaultModel: model,
      maxIter: 4,
    });
    // code -> executing -> code

    // This uses the defaut agentic router to determine which agent to handle first.  You can
    // optionally specifiy the agent that should execute first, and provide your own logic for
    // handling logic in between agent calls.
    const result = await network.run(event.data.input, ({ network }) => {
      if (network.state.kv.has("files")) {
        // Okay, we have some files.  Did an agent run tests?
        return executingAgent;
      }

      return defaultRoutingAgent.withModel(model);
    });

    return result;
  },
);

const systemPrompt =
  "You are an expert TypeScript programmer.  Given a set of asks, think step-by-step to plan clean, " +
  "idiomatic TypeScript code, with comments and tests as necessary.";

const codeWritingAgent = createAgent({
  name: "Code writer",
  // description helps LLM routers choose the right agents to run.
  description: "An expert TypeScript programmer which can write and debug code",
  // system defines a system prompt generated each time the agent is called by a network.
  system: (network) => {
    if (!network) {
      return systemPrompt;
    }

    // Each time this agent runs, it may produce "file" content.  Check if any
    // content has already been produced in an agentic workflow.
    const files = network.state.kv.get<Record<string, string>>("files");

    if (files === undefined) {
      // Use the default system prompt.
      return systemPrompt;
    }

    // There are files present in the network's state, so add them to the prompt to help
    // provide previous context automatically.
    let prompt = systemPrompt + "The following code already exists:";
    for (const [name, contents] of Object.entries(files)) {
      prompt += `<file name='${name}'>${contents}</file>`;
    }

    return prompt;
  },

  tools: [
    // This tool forces the model to generate file content as structured data.  Other options
    // are to use XML tags in a prompt, eg:
    //   "Do not respond with anything else other than the following XML tags:" +
    //   "- If you would like to write code, add all code within the following tags (replace $filename and $contents appropriately):" +
    //   "  <file name='$filename.ts'>$contents</file>";
    createTypedTool({
      name: "write_files",
      description: "Write code with the given filenames",
      parameters: z
        .object({
          files: z.array(
            z
              .object({
                filename: z.string(),
                content: z.string(),
              })
              .required(),
          ),
        })
        .required(),
      handler: (output, { network }) => {
        // files is the output from the model's response in the format above.
        // Here, we store OpenAI's generated files in the response.
        const files =
          network?.state.kv.get<Record<string, string>>("files") || {};

        for (const file of output.files) {
          files[file.filename] = file.content;
        }

        network?.state.kv.set<Record<string, string>>("files", files);
      },
    }),
  ],
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
