import { createTool } from '@inngest/agent-kit';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Phase 1: Setup & Security Sandboxing

// 1. Establish the Working Directory
const AGENT_FS_ROOT = process.env.AGENT_FS_ROOT || path.join(os.homedir(), 'AgentWorkspace');

/**
 * Initializes the agent's workspace directory. Checks if it exists, and if not,
 * creates it. This is a self-executing async function to ensure the workspace
 * is ready before any tools are used.
 */
(async () => {
  try {
    // Check if the directory exists. fs.access throws if it doesn't.
    await fs.access(AGENT_FS_ROOT);
  } catch {
    // If the directory does not exist, create it.
    try {
      await fs.mkdir(AGENT_FS_ROOT, { recursive: true });
      console.log(`Agent workspace created at: ${AGENT_FS_ROOT}`);
    } catch (error) {
      console.error(`FATAL: Could not create agent workspace at ${AGENT_FS_ROOT}. File system tools will not work.`, error);
      // We throw here to prevent the application from starting in a broken state where tools would fail.
      throw new Error("Agent workspace initialization failed.");
    }
  }
})();


/**
 * A security utility to resolve a user-provided path against the agent's
 * working directory and ensure it does not escape the sandbox.
 * @param userPath The relative path provided by the agent.
 * @returns The resolved, absolute path if it is safe.
 * @throws An error if the path is absolute or attempts to traverse outside the sandbox.
 */
const securePath = (userPath: string): string => {
  // Disallow any absolute paths. All paths must be relative to the workspace.
  if (path.isAbsolute(userPath)) {
    throw new Error("Access denied: Absolute paths are not permitted.");
  }

  // Safely join the user-provided path with our root directory.
  // path.join will normalize the path, handling elements like '.' and '..'.
  const resolvedPath = path.join(AGENT_FS_ROOT, userPath);
  
  // To be absolutely sure the path is within our root, we get the relative
  // path from the root and check if it tries to go "up" a directory.
  const relativePath = path.relative(AGENT_FS_ROOT, resolvedPath);

  // If the relative path starts with '..', it's trying to escape the sandbox.
  // An empty string for the relative path means it IS the root, which is safe.
  if (relativePath.startsWith('..')) {
    throw new Error("Access denied: Path is outside the authorized working directory.");
  }

  return resolvedPath;
};

// Phase 2: Core File I/O Tools

/**
 * A centralized error handler for file system tools to return consistent,
 * user-friendly error messages to the agent.
 * @param error The catched error.
 * @param toolName The name of the tool where the error occurred.
 * @returns A string describing the error.
 */
const handleToolError = (error: unknown, toolName: string): string => {
    if (error instanceof Error) {
        return `${toolName} failed: ${error.message}`;
    }
    return `${toolName} failed: An unknown error occurred.`;
};

/**
 * Reads the entire contents of a file at a given path within the workspace.
 * The path must be relative to the agent's working directory.
 */
export const readFile = createTool({
    name: 'readFile',
    description: 'Reads the entire contents of a file at a given path within the workspace.',
    parameters: z.object({
        path: z.string().describe('The relative path to the file to read.'),
    }),
    handler: async ({ path: userPath }) => {
        try {
            const safePath = securePath(userPath);
            const content = await fs.readFile(safePath, 'utf-8');
            return content;
        } catch (error) {
            return handleToolError(error, 'readFile');
        }
    },
});

/**
 * Writes content to a file at a given path within the workspace.
 * This will create the file if it does not exist, and overwrite it if it does.
 * It will also create any necessary parent directories.
 */
export const writeFile = createTool({
    name: 'writeFile',
    description: 'Writes content to a file. Creates the file if it does not exist, overwrites it if it does. Creates parent directories as needed.',
    parameters: z.object({
        path: z.string().describe('The relative path to the file to write.'),
        content: z.string().describe('The content to write to the file.'),
    }),
    handler: async ({ path: userPath, content }) => {
        try {
            const safePath = securePath(userPath);
            // Ensure parent directory exists before writing file
            await fs.mkdir(path.dirname(safePath), { recursive: true });
            await fs.writeFile(safePath, content, 'utf-8');
            return `Successfully wrote to ${userPath}`;
        } catch (error) {
            return handleToolError(error, 'writeFile');
        }
    },
});

/**
 * Deletes a file at a given path within the workspace.
 */
export const deleteFile = createTool({
    name: 'deleteFile',
    description: 'Deletes a file at a given path within the workspace.',
    parameters: z.object({
        path: z.string().describe('The relative path to the file to delete.'),
    }),
    handler: async ({ path: userPath }) => {
        try {
            const safePath = securePath(userPath);
            await fs.unlink(safePath);
            return `Successfully deleted ${userPath}`;
        } catch (error) {
            // Provide a more specific error message if the file doesn't exist.
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                 return `deleteFile failed: File not found at '${userPath}'.`;
            }
            return handleToolError(error, 'deleteFile');
        }
    },
});

// Phase 3: Directory Traversal & Search Tools

/**
 * Lists the contents (files and subdirectories) of a directory.
 * For directories, a "/" is appended to the name to distinguish them.
 */
export const listDirectory = createTool({
    name: 'listDirectory',
    description: 'Lists the contents (files and subdirectories) of a directory. For directories, a "/" is appended to the name.',
    parameters: z.object({
        path: z.string().describe('The relative path to the directory to list. Use "." for the root.'),
    }),
    handler: async ({ path: userPath }) => {
        try {
            const safePath = securePath(userPath);
            const entries = await fs.readdir(safePath, { withFileTypes: true });
            const files = entries.filter(e => e.isFile()).map(e => e.name);
            const dirs = entries.filter(e => e.isDirectory()).map(e => e.name + '/');
            return { files, directories: dirs };
        } catch (error) {
            return handleToolError(error, 'listDirectory');
        }
    },
});

/**
 * Creates a new directory (and any necessary parent directories) at a given path.
 */
export const createDirectory = createTool({
    name: 'createDirectory',
    description: 'Creates a new directory (and any necessary parent directories) at a given path.',
    parameters: z.object({
        path: z.string().describe('The relative path where the directory should be created.'),
    }),
    handler: async ({ path: userPath }) => {
        try {
            const safePath = securePath(userPath);
            await fs.mkdir(safePath, { recursive: true });
            return `Successfully created directory at ${userPath}`;
        } catch (error) {
            return handleToolError(error, 'createDirectory');
        }
    },
});

/**
 * Deletes a directory and all of its contents recursively.
 */
export const deleteDirectory = createTool({
    name: 'deleteDirectory',
    description: 'Deletes a directory and all of its contents recursively.',
    parameters: z.object({
        path: z.string().describe('The relative path to the directory to delete.'),
    }),
    handler: async ({ path: userPath }) => {
        try {
            const safePath = securePath(userPath);
            // fs.rm with recursive:true is the modern equivalent of rm -rf
            await fs.rm(safePath, { recursive: true, force: true });
            return `Successfully deleted directory ${userPath}`;
        } catch (error) {
             if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                 return `deleteDirectory failed: Directory not found at '${userPath}'.`;
            }
            return handleToolError(error, 'deleteDirectory');
        }
    },
});

// Helper for findFilesByName to convert a simple wildcard to a regex.
const globToRegex = (glob: string): RegExp => {
    const regexString = glob.replace(/\./g, '\\.').replace(/\*/g, '.*');
    return new RegExp(`^${regexString}$`);
};

// Recursive helper function for findFilesByName.
async function findFilesRecursive(dir: string, pattern: RegExp, baseDir: string): Promise<string[]> {
    let results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(await findFilesRecursive(fullPath, pattern, baseDir));
        } else if (entry.isFile() && pattern.test(entry.name)) {
            // return the path relative to the agent's root workspace
            results.push(path.relative(baseDir, fullPath));
        }
    }
    return results;
}

/**
 * Recursively finds files by a simple wildcard pattern (e.g., "*.ts", "data*").
 * Only `*` is supported as a wildcard character.
 */
export const findFilesByName = createTool({
    name: 'findFilesByName',
    description: 'Recursively finds files by a simple wildcard pattern (e.g., "*.ts", "data*"). Only `*` is supported as a wildcard.',
    parameters: z.object({
        pattern: z.string().describe('A simple wildcard pattern. Only `*` is supported.'),
        startPath: z.string().optional().describe('An optional subdirectory to start the search from. Defaults to the root of the workspace.'),
    }),
    handler: async ({ pattern, startPath = '.' }) => {
        try {
            const safeStartPath = securePath(startPath);
            const regex = globToRegex(pattern);
            const files = await findFilesRecursive(safeStartPath, regex, AGENT_FS_ROOT);
            return files.length > 0 ? files : "No files found matching the pattern.";
        } catch (error) {
            return handleToolError(error, 'findFilesByName');
        }
    },
});

/**
 * Recursively searches for a string or regex pattern in files within a given path.
 * Returns a list of matching lines, including file path and line number.
 */
export const searchFileContent = createTool({
    name: 'searchFileContent',
    description: 'Recursively searches for a string or regex pattern in files within a given path.',
    parameters: z.object({
        query: z.string().describe('The string or regular expression to search for.'),
        searchPath: z.string().optional().describe('The relative path to a file or directory to search in. Defaults to the entire workspace.'),
    }),
    handler: async ({ query, searchPath = '.' }) => {
        try {
            const safeSearchPath = securePath(searchPath);
            const results: { file: string; lineNumber: number; line: string }[] = [];
            const regex = new RegExp(query);

            const searchInFile = async (filePath: string) => {
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const lines = content.split('\n');
                    lines.forEach((line, index) => {
                        if (regex.test(line)) {
                            results.push({
                                file: path.relative(AGENT_FS_ROOT, filePath),
                                lineNumber: index + 1,
                                line: line.trim(),
                            });
                        }
                    });
                } catch (e) {
                    // Fail silently for unreadable files (e.g., binary files).
                }
            };

            const searchInDirectory = async (dirPath: string) => {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        await searchInDirectory(fullPath);
                    } else if (entry.isFile()) {
                        await searchInFile(fullPath);
                    }
                }
            };
            
            const stats = await fs.stat(safeSearchPath);
            if (stats.isDirectory()) {
                await searchInDirectory(safeSearchPath);
            } else {
                await searchInFile(safeSearchPath);
            }

            if (results.length === 0) {
                return 'No matches found.';
            }

            // To avoid overwhelming the agent's context window, truncate long result lists.
            if (results.length > 50) {
                const truncatedResults = results.slice(0, 50);
                return {
                    matches: truncatedResults,
                    note: `Results truncated. Showing 50 of ${results.length} total matches.`
                };
            }

            return { matches: results };
        } catch (error) {
            return handleToolError(error, 'searchFileContent');
        }
    }
});

// Phase 4: Integration

/**
 * A suite of all file system tools, exported for easy integration into an agent.
 */
export const fileSystemTools = [
    readFile,
    writeFile,
    deleteFile,
    listDirectory,
    createDirectory,
    deleteDirectory,
    findFilesByName,
    searchFileContent,
];
