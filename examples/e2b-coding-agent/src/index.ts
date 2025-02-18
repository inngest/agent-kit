/* eslint-disable */
import "dotenv/config";

import { Sandbox } from "@e2b/code-interpreter";
import { z } from "zod";
import {
  createAgent,
  createNetwork,
  createTool,
  anthropic,
  TextMessage,
  InferenceResult,
} from "@inngest/agent-kit";

async function runSandboxCommand(sandboxId: string, command: string) {
  const buffers = { stdout: "", stderr: "" };

  try {
    const s = await Sandbox.connect(sandboxId);
    const result = await s.commands.run(command, {
      onStdout: (data) => {
        buffers.stdout += data;
      },
      onStderr: (data) => {
        buffers.stderr += data;
      },
    });
    console.log("result", result.stdout);
    return result.stdout;
  } catch (e) {
    console.error(
      `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
    );
    return `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`;
  }
}

function lastAssistantTextMessageContent(result: InferenceResult) {
  const lastAssistantMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant"
  );
  const message = result.output[lastAssistantMessageIndex] as
    | TextMessage
    | undefined;
  return message?.content
    ? typeof message.content === "string"
      ? message.content
      : message.content.map((c) => c.text).join("")
    : undefined;
}

let sandboxId: string;

// ANGLE: Building Coding Agent with E2B
// Experiment: Rebuild Cursors Agent with E2B and Agent Kit

// PRD:
// We want to create a network of agents that generates unit tests with high coverage for a given codebase.
// The steps will be the following:
// 1. upload the project .zip file into a persisted e2b sandbox
// 2. run the network of agents to generate unit tests with high coverage

async function main() {
  const sandbox = await Sandbox.create();

  console.log("sandbox", sandbox.sandboxId);
  sandboxId = sandbox.sandboxId;

  const agent = createAgent({
    name: "Coding Agent",
    description: "An expert coding agent",
    system: `You are a coding agent help the user to achieve the described task.

    When running commands, keep in mind that the terminal is non-interactive, remind to use the '-y' flag when running commands.

    Once the task completed, you should return the following information:
    <task_summary>
    </task_summary>

    Think step-by-step before you start the task.
    `,
    // mcpServers: [
    //   {
    //     name: "neon",
    //     transport: {
    //       type: "sse",
    //       url: "https://neon.tech/mcp",
    //     },
    //   },
    // ],
    tools: [
      // terminal use
      createTool({
        name: "terminal",
        description: "Use the terminal to run commands",
        parameters: z.object({
          command: z.string(),
        }),
        handler: async ({ command }) => {
          console.log("terminal", command);
          return await runSandboxCommand(sandboxId, command);
        },
      }),
      // create or update file
      createTool({
        name: "createOrUpdateFiles",
        description: "Create or update files in the sandbox",
        parameters: z.object({
          files: z.array(
            z.object({
              path: z.string(),
              content: z.string(),
            })
          ),
        }),
        handler: async ({ files }) => {
          console.log(
            "createOrUpdateFiles",
            files.map((f) => f.path)
          );
          try {
            const s = await Sandbox.connect(sandboxId);
            for (const file of files) {
              await s.files.write(file.path, file.content);
            }
            return `Files created or updated: ${files.map((f) => f.path).join(", ")}`;
          } catch (e) {
            console.error("error", e);
            return "Error: " + e;
          }
        },
      }),
      // read files
      createTool({
        name: "readFiles",
        description: "Read files from the sandbox",
        parameters: z.object({
          files: z.array(z.string()),
        }),
        handler: async ({ files }) => {
          console.log("readFiles", files);
          try {
            const s = await Sandbox.connect(sandboxId);
            const contents = [];
            for (const file of files) {
              const content = await s.files.read(file);
              contents.push({ path: file, content });
            }
            return JSON.stringify(contents);
          } catch (e) {
            console.error("error", e);
            return "Error: " + e;
          }
        },
      }),
      // run code
      createTool({
        name: "runCode",
        description: "Run the code in the sandbox",
        parameters: z.object({
          code: z.string(),
        }),
        handler: async ({ code }) => {
          console.log("runCode", code);

          try {
            const s = await Sandbox.connect(sandboxId);
            const result = await s.runCode(code);
            console.log("result", result);

            return result.logs.stdout.join("\n");
          } catch (e) {
            console.error("error", e);
            return "Error: " + e;
          }
        },
      }),
    ],
    lifecycle: {
      onResponse: async ({ result, network }) => {
        const lastAssistantMessageText =
          lastAssistantTextMessageContent(result);
        if (lastAssistantMessageText) {
          if (lastAssistantMessageText.includes("<task_summary>")) {
            network?.state.kv.set("task_summary", lastAssistantMessageText);
          }
        }

        return result;
      },
    },
    //  lifecycle: {
    //    // ensure we got a Sandbox available
    //    onStart: async ({ network, history, prompt }) => {
    //      if (!network?.state.kv.has("sandboxId")) {
    //        const s = await Sandbox.create();
    //        network?.state.kv.set("sandboxId", s.sandboxId);
    //        console.log("created sandbox", s.sandboxId);
    //      }

    //      if (
    //        !network?.state.kv.has("sandbox") &&
    //        network?.state.kv.has("sandboxId")
    //      ) {
    //        const s = await Sandbox.connect(network!.state.kv.get("sandboxId")!);
    //        network?.state.kv.set("sandbox", s);
    //        console.log("connected to sandbox", s.sandboxId);
    //      }

    //      return {
    //        history: history || [],
    //        prompt: prompt || [],
    //        stop: false,
    //      };
    //    },
    //  },
  });

  const network = createNetwork({
    name: "coding-agent-network",
    agents: [agent],
    defaultModel: anthropic({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 1000,
    }),
    defaultRouter: ({ network }) => {
      if (network?.state.kv.has("task_summary")) {
        return;
      }

      return agent;
    },
  });

  const result = await network.run(process.argv.slice(2).join(" "));

  console.log(result.state.kv.get("task_summary"));

  const ss = await Sandbox.connect(sandboxId);
  await ss.kill();
}

main();
