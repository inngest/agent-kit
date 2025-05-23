/* eslint-disable */
import "dotenv/config";

import fs from "fs";
import { z } from "zod";
import {
  createAgent,
  createNetwork,
  createTool,
  anthropic,
} from "@inngest/agent-kit";

import {
  getSandbox,
  lastAssistantTextMessageContent,
  prettyPrintLastAssistantMessage,
} from "./utils.js";

async function main() {
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
    model: anthropic({
      model: "claude-3-5-sonnet-latest",
      defaultParameters: {
        max_tokens: 4096,
      },
    }),
    tools: [
      // terminal use
      createTool({
        name: "terminal",
        description: "Use the terminal to run commands",
        parameters: z.object({
          command: z.string(),
        }),
        handler: async ({ command }, { network }) => {
          console.log("terminal < ", command);
          const buffers = { stdout: "", stderr: "" };

          try {
            const sandbox = await getSandbox(network);
            const result = await sandbox.commands.run(command, {
              onStdout: (data: string) => {
                // console.log("terminal stdout >", data);
                buffers.stdout += data;
              },
              onStderr: (data: string) => {
                // console.log("terminal stderr >", data);
                buffers.stderr += data;
              },
            });
            console.log("terminal result >", result.stdout);
            return result.stdout;
          } catch (e) {
            console.error(
              `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
            );
            return `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`;
          }
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
        handler: async ({ files }, { network }) => {
          console.log(
            "createOrUpdateFiles <",
            files.map((f) => f.path)
          );
          try {
            const sandbox = await getSandbox(network);
            for (const file of files) {
              await sandbox.files.write(file.path, file.content);
            }
            return `Files created or updated: ${files
              .map((f) => f.path)
              .join(", ")}`;
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
        handler: async ({ files }, { network }) => {
          console.log("readFiles <", files);
          try {
            const sandbox = await getSandbox(network);
            const contents = [];
            for (const file of files) {
              const content = await sandbox.files.read(file);
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
        handler: async ({ code }, { network }) => {
          console.log("runCode <", code);

          try {
            const sandbox = await getSandbox(network);
            const result = await sandbox.runCode(code);
            console.log("runCode result >", result);

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
        prettyPrintLastAssistantMessage(result);

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
  });

  const network = createNetwork({
    name: "coding-agent-network",
    agents: [agent],
    maxIter: 15,
    defaultRouter: ({ network, callCount }) => {
      console.log(` --- Iteration #${callCount} ---`);
      if (network?.state.kv.has("task_summary")) {
        return;
      }

      return agent;
    },
  });

  const result = await network.run(process.argv.slice(2).join(" "));

  console.log(result.state.kv.get("task_summary"));

  const sandbox = await getSandbox(result);

  if (sandbox) {
    console.log("------------------------------------");
    console.log("Downloading artifact...");
    await sandbox.commands.run(
      "touch artifact.tar.gz && tar --exclude=artifact.tar.gz --exclude=node_modules --exclude=.npm --exclude=.env --exclude=.bashrc --exclude=.profile  --exclude=.bash_logout --exclude=.env* -zcvf artifact.tar.gz ."
    );
    const artifact = await sandbox.files.read("artifact.tar.gz", {
      format: "blob",
    });
    // convert blob to arraybuffer
    const arrayBuffer = await artifact.arrayBuffer();
    fs.writeFileSync("artifact.tar.gz", Buffer.from(arrayBuffer));
    console.log("Artifact downloaded in artifact.tar.gz");
    console.log(
      "Extract artifact by running: `mkdir artifact && tar -xvzf artifact.tar.gz -C artifact`"
    );
    console.log("------------------------------------");

    await sandbox.kill();
  }
}

main();
