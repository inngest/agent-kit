import "dotenv/config";

import { z } from "zod";
import {
  createAgent,
  createNetwork,
  createState,
  createTool,
  anthropic,
} from "@inngest/agent-kit";
import { SandboxError, stdoutText, stderrText } from "@tenkicloud/sandbox";
import type { ExecResult, Session } from "@tenkicloud/sandbox";
import readline from "node:readline/promises";
import {
  WORKSPACE_DIR,
  createSession,
  ensureExternallyReachable,
  getSession,
  resolveWorkspacePath,
  extractTextMessageContent,
  logDebug,
} from "./utils.js";

const DEV_SERVER_LOG_FILE = "/home/tenki/dev-server.log";

// Formats a Tenki exec result the same way for every tool response.
function formatExecResult(result: ExecResult): string {
  const stdout = stdoutText(result);
  const stderr = stderrText(result);
  return `Exit code: ${result.exitCode}${stdout ? `\nStdout: ${stdout}` : ""}${
    stderr ? `\nStderr: ${stderr}` : ""
  }`;
}

async function main() {
  const codeRunTool = createTool({
    name: "codeRunTool",
    description: `Executes code in the Tenki sandbox. Use this tool to run code snippets, scripts, or application entry points.
Parameters:
    - language: The language of the code, either "python" or "javascript".
    - code: Code to execute.
    - argv: Command line arguments to pass to the code.
    - env: Environment variables for the code execution, as key-value pairs.`,
    parameters: z.object({
      language: z.enum(["python", "javascript"]),
      code: z.string(),
      argv: z.array(z.string()).nullable(),
      env: z.record(z.string(), z.string()).nullable(),
    }),
    handler: async ({ language, code, argv, env }, { network }) => {
      try {
        const session = await getSession(network);
        console.log(`[TOOL: codeRunTool]\nLanguage: ${language}\n${code}`);
        // exec is argv-style (no shell), so the code needs no quoting.
        const [command, flag] =
          language === "python" ? ["python3", "-c"] : ["node", "-e"];
        const response = await session.exec(command!, {
          args: [flag!, code, ...(argv ?? [])],
          env: env ?? {},
          cwd: WORKSPACE_DIR,
          timeoutMs: 5 * 60 * 1000,
        });
        const responseMessage = `Code run result:\n${formatExecResult(
          response
        )}`;
        logDebug(responseMessage);
        return responseMessage;
      } catch (error) {
        console.error("Error executing code:", error);
        if (error instanceof SandboxError)
          return `Code execution Tenki error: ${error.message}`;
        else return "Error executing code";
      }
    },
  });

  const shellTool = createTool({
    name: "shellTool",
    description: `Executes a shell command inside the Tenki sandbox environment. Use this tool for tasks like installing packages, running scripts, or manipulating files via shell commands. Never use this tool to start a development server; always use startDevServerTool for this purpose.
Parameters:
    - shellCommand: Shell command to execute (e.g., "npm install", "ls -la").
    - env: Environment variables to set for the command as key-value pairs (e.g. { "NODE_ENV": "production" }).`,
    parameters: z.object({
      shellCommand: z.string(),
      env: z.record(z.string(), z.string()).nullable(),
    }),
    handler: async ({ shellCommand, env }, { network }) => {
      try {
        // Instructive error so the model can correct a malformed tool call.
        if (typeof shellCommand !== "string" || shellCommand.trim() === "") {
          return "Error: 'shellCommand' must be a non-empty string. Provide the exact shell command to execute, e.g. { \"shellCommand\": \"ls -la\" }.";
        }
        const session = await getSession(network);
        console.log(
          `[TOOL: shellTool]\nCommand: ${shellCommand}\nEnv: ${JSON.stringify(
            env
          )}`
        );
        // Wrapped in `bash -c` (not `-l`: a login shell resets the cwd).
        // Commands ending in `&` are rewritten to a fully redirected nohup'd
        // group — a background process holding the exec streams would
        // otherwise keep the call hanging until the sandbox dies.
        const backgroundMatch = shellCommand.trim().match(/^([\s\S]*?)\s*&$/);
        let commandToRun = shellCommand;
        if (backgroundMatch && backgroundMatch[1]) {
          const foreground = backgroundMatch[1].replace(/'/g, "'\\''");
          const logFile = `/tmp/background-${Date.now()}.log`;
          commandToRun = `{ nohup bash -c '${foreground}' ; } > ${logFile} 2>&1 </dev/null & echo "[process backgrounded; output: ${logFile}]"`;
        }
        const response = await session.exec("bash", {
          args: ["-c", commandToRun],
          env: env ?? {},
          cwd: WORKSPACE_DIR,
          timeoutMs: 5 * 60 * 1000,
        });
        const responseMessage = `Command result:\n${formatExecResult(
          response
        )}`;
        logDebug(responseMessage);
        return responseMessage;
      } catch (error) {
        console.error("Error executing shell command:", error);
        if (error instanceof SandboxError)
          return `Shell command execution Tenki error: ${error.message}`;
        else return "Error executing shell command";
      }
    },
  });

  const uploadFilesTool = createTool({
    name: "uploadFilesTool",
    description: `Uploads one or more files to the Tenki sandbox. Use this tool to transfer source code, configuration files, or other assets required for execution or setup. If a file already exists at the specified path, its contents will be replaced with the new content provided. To update a file, simply upload it again with the desired content.
Parameters:
  - files: Array of files to upload. Each file object must have:
    - path (string): The destination file path in the sandbox.
    - content (string): The full contents of the file as a string.
    Example: files: [{ path: "src/index.ts", content: "console.log('Hello world');" }]
Note: Always use double quotes (") for the outer 'content' string property. When writing JavaScript or TypeScript file content, use single quotes (') for string literals inside the file. For JSON files, always convert the object to a string before passing as 'content'.`,
    parameters: z.object({
      files: z.array(
        z.object({
          path: z.string(),
          content: z.string(),
        })
      ),
    }),
    handler: async ({ files }, { network }) => {
      try {
        if (files == null) {
          return "Error: 'files' must be an array of { path, content } objects. The previous call arrived without it (possibly a truncated tool call) - retry with smaller file contents if needed.";
        }
        // Handle case when model hallucinates and passes files as string instead of specificed array format
        if (typeof files === "string") {
          try {
            files = JSON.parse(files);
          } catch (e) {
            throw new TypeError(
              "Parameter 'files' must be an array, not a string. If you are passing a string, it must be valid JSON representing an array."
            );
          }
        }
        files = files.map((file) => ({
          ...file,
          content:
            // Handle case when model hallucinates and passes JSON files content as object instead of string
            typeof file.content === "string"
              ? file.content
              : JSON.stringify(file.content, null, 2),
        }));
        const session = await getSession(network);
        console.log(`[TOOL: uploadFilesTool]`);
        logDebug(
          `Uploading files: ${files
            .map((f) => "Path: " + f.path + "\nContent: " + f.content)
            .join("\n\n")}`
        );
        for (const file of files) {
          const destination = resolveWorkspacePath(file.path);
          const parentDirectory = destination.slice(
            0,
            destination.lastIndexOf("/")
          );
          if (parentDirectory)
            await session.exec("mkdir", { args: ["-p", parentDirectory] });
          await session.writeFile(destination, file.content);
        }
        const uploadFilesMessage = `Successfully created or update files: ${files
          .map((f) => f.path)
          .join(", ")}`;
        logDebug(uploadFilesMessage);
        return uploadFilesMessage;
      } catch (error) {
        console.error("Error creating/uploading files:", error);
        if (error instanceof SandboxError)
          return `Files create/upload Tenki error: ${error.message}`;
        else return "Error creating/uploading files";
      }
    },
  });

  const readFileTool = createTool({
    name: "readFileTool",
    description: `Reads the contents of a file from the Tenki sandbox. Use this tool to retrieve source code, configuration files, or other assets for analysis or processing.`,
    parameters: z.object({
      filePath: z.string(),
    }),
    handler: async ({ filePath }, { network }) => {
      try {
        const session = await getSession(network);
        console.log(`[TOOL: readFileTool]\nFile path: ${filePath}`);
        const fileBytes = await session.readFile(
          resolveWorkspacePath(filePath)
        );
        const fileContent = new TextDecoder().decode(fileBytes);
        const readFileMessage = `Successfully read file: ${filePath}\nContent:\n${fileContent}`;
        logDebug(readFileMessage);
        return fileContent;
      } catch (error) {
        console.error("Error reading file:", error);
        if (error instanceof SandboxError)
          return `File reading Tenki error: ${error.message}`;
        else return "Error reading file";
      }
    },
  });

  const deleteFileTool = createTool({
    name: "deleteFileTool",
    description: `Deletes a file from the Tenki sandbox. Use this tool to remove unnecessary or temporary files from the sandbox environment.`,
    parameters: z.object({
      filePath: z.string(),
    }),
    handler: async ({ filePath }, { network }) => {
      try {
        const session = await getSession(network);
        console.log(`[TOOL: deleteFileTool]\nFile path: ${filePath}`);
        await session.remove(resolveWorkspacePath(filePath));
        const deleteFileMessage = `Successfully deleted file: ${filePath}`;
        logDebug(deleteFileMessage);
        return deleteFileMessage;
      } catch (error) {
        console.error("Error deleting file:", error);
        if (error instanceof SandboxError)
          return `File deletion Tenki error: ${error.message}`;
        else return "Error deleting file";
      }
    },
  });

  const createDirectoryTool = createTool({
    name: "createDirectoryTool",
    description: `Creates a new directory in the Tenki sandbox. Use this tool to prepare folder structures for projects, uploads, or application data.
Parameters:
    - directoryPath: The directory path to create.`,
    parameters: z.object({
      directoryPath: z.string(),
    }),
    handler: async ({ directoryPath }, { network }) => {
      try {
        const session = await getSession(network);
        console.log(
          `[TOOL: createDirectoryTool]\nDirectory path: ${directoryPath}`
        );
        // `mkdir -p` creates intermediate directories as needed.
        await session.exec("mkdir", {
          args: ["-p", resolveWorkspacePath(directoryPath)],
        });
        const createDirectoryMessage = `Successfully created directory: ${directoryPath}`;
        logDebug(createDirectoryMessage);
        return createDirectoryMessage;
      } catch (error) {
        console.error("Error creating directory:", error);
        if (error instanceof SandboxError)
          return `Directory creation Tenki error: ${error.message}`;
        else return "Error creating directory";
      }
    },
  });

  const deleteDirectoryTool = createTool({
    name: "deleteDirectoryTool",
    description: `Deletes a directory from the Tenki sandbox. Use this tool to remove unnecessary or temporary directories from the sandbox environment.`,
    parameters: z.object({
      directoryPath: z.string(),
    }),
    handler: async ({ directoryPath }, { network }) => {
      try {
        const session = await getSession(network);
        console.log(
          `[TOOL: deleteDirectoryTool]\nDirectory path: ${directoryPath}`
        );
        await session.exec("rm", {
          args: ["-rf", resolveWorkspacePath(directoryPath)],
        });
        const deleteDirectoryMessage = `Successfully deleted directory: ${directoryPath}`;
        logDebug(deleteDirectoryMessage);
        return deleteDirectoryMessage;
      } catch (error) {
        console.error("Error deleting directory:", error);
        if (error instanceof SandboxError)
          return `Directory deletion Tenki error: ${error.message}`;
        else return "Error deleting directory";
      }
    },
  });

  const startDevServerTool = createTool({
    name: "startDevServerTool",
    description: `Starts a development server in the sandbox environment. Use this tool to start any development server (e.g., Next.js, React, etc.). Never use shellTool to start a development server; always use this tool for that purpose.
Parameters:
  - startCommand: The shell command to start the development server (e.g., "npm run dev"). For the preview URL to work the server MUST listen on all interfaces and accept any host header: configure this BEFORE starting it (Vite: "server: { host: true, allowedHosts: true }" in vite.config.js).`,
    parameters: z.object({
      startCommand: z.string(),
    }),
    handler: async ({ startCommand }, { network }) => {
      try {
        const session = await getSession(network);
        console.log(
          `[TOOL: startDevServerTool]\nStart command: ${startCommand}`
        );
        // Detached via a fully redirected nohup'd group (a process holding
        // the exec streams would hang the call); the inner `bash -c` lets
        // compound commands work under nohup. Output goes to the log that
        // checkDevServerHealthTool reads.
        const escapedStartCommand = startCommand.replace(/'/g, "'\\''");
        const response = await session.exec("bash", {
          args: [
            "-c",
            `{ nohup bash -c '${escapedStartCommand}' ; } > ${DEV_SERVER_LOG_FILE} 2>&1 </dev/null & echo $!`,
          ],
          cwd: WORKSPACE_DIR,
        });
        network.state.data.devServerPid = stdoutText(response).trim();
        const startDevServerMessage = `Successfully started dev server with command: ${startCommand}`;
        logDebug(startDevServerMessage);
        return startDevServerMessage;
      } catch (error) {
        console.error("Error starting dev server:", error);
        if (error instanceof SandboxError)
          return `Dev server start Tenki error: ${error.message}`;
        else return "Error starting dev server";
      }
    },
  });

  const checkDevServerHealthTool = createTool({
    name: "checkDevServerHealthTool",
    description: `Checks the health of a development server. Use this tool after starting a dev server to verify it is running and accessible.`,
    parameters: z.object({}),
    handler: async ({}, { network }) => {
      try {
        console.log(`[TOOL: checkDevServerHealthTool]`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const session = await getSession(network);
        const logBytes = await session.readFile(DEV_SERVER_LOG_FILE);
        const devServerLogs = new TextDecoder().decode(logBytes);
        const healthMessage = `Dev server health check result:\nLogs: ${devServerLogs}`;
        logDebug(healthMessage);
        return healthMessage;
      } catch (error) {
        console.error("Error checking dev server health:", error);
        if (error instanceof SandboxError)
          return `Dev server health check Tenki error: ${error.message}`;
        return `Error checking dev server health`;
      }
    },
  });

  const codingAgent = createAgent({
    name: "Coding Agent",
    description:
      "An autonomous coding agent for building software in a Tenki sandbox",
    system: `You are a coding agent designed to help the user achieve software development tasks. You have access to a Tenki sandbox environment.

Capabilities:
- You can execute code snippets or scripts.
- You can run shell commands to install dependencies, manipulate files, and set up environments.
- You can create, upload, and organize files and directories to build basic applications and project structures.

Workspace Instructions:
- You do not need to define, set up, or specify the workspace directory. Assume you are already inside a default workspace directory that is ready for app creation.
- All file and folder operations (create, upload, organize) should use paths relative to this default workspace.
- Do not attempt to create or configure the workspace itself; focus only on the requested development tasks.

Guidelines:
- Always analyze the user's request and plan your steps before taking action.
- Prefer automation and scripting over manual or interactive steps.
- When installing packages or running commands that may prompt for input, use flags (e.g., '-y') to avoid blocking.
- If you are developing an app that is served with a development server (e.g. Next.js, React):
  1. Return the port information in the form: DEV_SERVER_PORT=$PORT (replace $PORT with the actual port number).
  2. Before starting the development server, configure it so the preview URL works: it must listen on all interfaces AND accept requests from any host, since the app is served through a proxied preview domain. For Vite, add "server: { host: true, allowedHosts: true }" to vite.config.js. For Next.js, pass "-H 0.0.0.0".
  3. Start the development server.
  4. After starting the dev server, always check its health in the next iteration. Only mark the task as complete if the health check passes: there must be no errors thrown, and the log content must not indicate a problem (such as error messages, stack traces, or failed startup). If any of these are present, diagnose and fix the issue before completing the task.
- When you have completed the requested task, set the "TASK_COMPLETED" string in your output to signal that the app is finished.
`,
    model: anthropic({
      model: "claude-haiku-4-5-20251001",
      defaultParameters: {
        // Roomy enough for tool calls carrying whole file contents.
        max_tokens: 8192,
      },
    }),
    tools: [
      shellTool,
      codeRunTool,
      uploadFilesTool,
      readFileTool,
      deleteFileTool,
      createDirectoryTool,
      deleteDirectoryTool,
      startDevServerTool,
      checkDevServerHealthTool,
    ],
  });

  // One long-lived Tenki session is used for the whole agent run. It is
  // created inside the `try` so that any failure after the VM exists still
  // reaches the `finally` teardown instead of leaving the sandbox running
  // until its max duration limit.
  let session: Session | undefined;

  // `finally` does not run when Node is killed by a signal (Ctrl+C at the
  // readline prompt, `docker stop`, a closed terminal), which would leave
  // the sandbox running until its max duration; tear it down explicitly.
  // `once` so a second signal during cleanup falls back to a forced exit.
  const terminateOnSignal = async (signal: NodeJS.Signals) => {
    console.log(`\nReceived ${signal}; terminating the sandbox session...`);
    if (session) await session.closeIfOpen();
    process.exit(1);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => void terminateOnSignal(signal));
  }

  try {
    session = await createSession();

    const network = createNetwork({
      name: "coding-agent-network",
      agents: [codingAgent],
      maxIter: 30,
      defaultState: createState<Record<string, any>>({ session }),
      defaultRouter: ({ network, callCount }) => {
        const previousIterationMessageContent = extractTextMessageContent(
          network.state.results.at(-1)
        );
        if (previousIterationMessageContent)
          logDebug(`Iteration message:\n${previousIterationMessageContent}\n`);
        console.log(`\n ===== Iteration #${callCount + 1} =====\n`);
        if (callCount > 0) {
          if (previousIterationMessageContent.includes("TASK_COMPLETED")) {
            // The port may be reported in any iteration; keep the last one.
            for (const result of network.state.results) {
              const portMatch = extractTextMessageContent(result).match(
                /DEV_SERVER_PORT=([0-9]+)/
              );
              if (portMatch && portMatch[1])
                network.state.data.devServerPort = parseInt(portMatch[1], 10);
            }
            return;
          }
        }
        return codingAgent;
      },
    });

    const result = await network.run(
      `Create a minimal React app called "Notes" that lets users add, view, and delete notes. Each note should have a title and content. Use Create React App or Vite for setup. Include a simple UI with a form to add notes and a list to display them.`
    );

    const devServerPort = result.state.data.devServerPort;
    if (devServerPort) {
      // Dev servers often bind to loopback only (e.g. Vite without --host),
      // which makes the exposed preview URL unreachable (502 from the edge).
      // If /proc/net/tcp shows no wildcard listener for the port, bridge it
      // with a tiny TCP relay bound to 0.0.0.0 and expose the relay instead.
      const portToExpose = await ensureExternallyReachable(
        session,
        devServerPort
      );
      const exposedPort = await session.exposePort(portToExpose);
      console.log(
        "\x1b[32m✔ App is ready!\x1b[0m\n\x1b[36mPreview: " +
          exposedPort.previewUrl +
          "\x1b[0m"
      );
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      // readline swallows Ctrl+C on a TTY instead of signaling the process.
      rl.on("SIGINT", () => void terminateOnSignal("SIGINT"));
      await rl.question(
        "Press Enter to terminate the sandbox and exit...\n"
      );
      rl.close();
    }
  } catch (error) {
    console.error("An error occurred during the agent run:", error);
    // Fail loudly: without this, `npm run start` exits 0 on a failed run
    // and CI/Docker treats it as successful.
    process.exitCode = 1;
  } finally {
    if (session) await session.closeIfOpen();
  }
}

main();
