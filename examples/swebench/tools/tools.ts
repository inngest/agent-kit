import { createTool, type Tool } from "@inngest/agent-kit";
import fs from "node:fs";
import path from "node:path";
import Parser from "tree-sitter";
import Py from "tree-sitter-python";
import { z } from "zod";
import type { AgentState } from "../networks/codeWritingNetwork";

// NOTE:  In this repo, all files are stored in "./opt/" as the prefix.
const WORKING_DIR = "./opt";

// PyClass represents a class parsed from a python file.
interface PyClass {
  name: string;
  startLine: number;
  endLine: number;
  methods: PyFn[];
}

// PyFN represents a function parsed from a python file.  This may belong to a class or
// it may be a top-level function.
interface PyFn {
  name: string;
  parameters: string;
  startLine: number;
  endLine: number;
  body: string;
}

export const listFilesTool = createTool({
  name: "list_files",
  description:
    "Lists all files within the project, returned as a JSON string containing the path to each file",
  handler: async (_input, opts: Tool.Options<AgentState>) => {
    const repo = opts.network?.state.data.repo || "";
    const repoDir = path.join(WORKING_DIR, repo);

    const files = await opts.step?.run("list files", () => {
      return fs
        .readdirSync(repoDir, { recursive: true })
        .filter((name) => name.indexOf(".git") !== 0)
        .map(f => f.toString());
    });

    // Store all files within state.  Note that this happens outside of steps
    // so that this is not memoized.
    if (opts.network) {
      opts.network.state.data.files = files;
    }

    return files;
  },
});

export const readFileTool = createTool({
  name: "read_file",
  description: "Reads a single file given its filename, returning its contents",
  parameters: z.object({
    filename: z.string(),
  }),
  handler: async ({ filename }, opts: Tool.Options<AgentState>) => {
    const content = await opts.step?.run(`read file: ${filename}`, () => {
      return readFile(opts.network?.state.data.repo || "", filename);
    });
    return content;
  },
});

export const writeFileTool = createTool({
  name: "write_file",
  description: "Writes a single file to disk with its content",
  parameters: z.object({
    filename: z.string(),
    content: z.string(),
  }),
  handler: async ({ filename, content }, opts: Tool.Options<AgentState>) => {
    await opts.step?.run(`write file: ${filename}`, () => {
      return writeFile(
        opts.network?.state.data.repo || "",
        filename,
        content
      );
    });
    return content;
  },
});

/**
 * extractFnTool extracts all top level functions and classes from a Python file.  It also
 * parses all method definitions of a class.
 *
 */
export const extractClassAndFnsTool = createTool({
  name: "extract_classes_and_functions",
  description:
    "Return all classes names and their functions, including top level functions",
  parameters: z.object({
    filename: z.string(),
  }),
  handler: async (input, opts: Tool.Options<AgentState>) => {
    return await opts.step?.run("parse file", () => {
      const contents = readFile(
        opts.network?.state.data.repo || "",
        input.filename
      );
      return parseClassAndFns(contents);
    });
  },
});

export const replaceClassMethodTool = createTool({
  name: "replace_class_method",
  description: "Replaces a method within a specific class entirely.",
  parameters: z.object({
    filename: z.string(),
    class_name: z.string(),
    function_name: z.string(),
    new_contents: z.string(),
  }),
  handler: async (
    { filename, class_name, function_name, new_contents },
    opts: Tool.Options<AgentState>
  ) => {
    const updated = await opts.step?.run(
      `update class method in "${filename}": ${class_name}.${function_name}`,
      () => {
        // Re-parse the contents to find the correct start and end offsets.
        const contents = readFile(
          opts.network?.state.data.repo || "",
          filename
        );
        const parsed = parseClassAndFns(contents);

        const c = parsed.classes.find((c) => class_name === c.name);
        const fn = c?.methods.find((f) => f.name === function_name);
        if (!c || !fn) {
          // TODO: Redo the planning as this wasn't found.
          throw new Error("TODO: redo plan");
        }

        return contents
          .split("\n")
          .reduce((updated, line, idx) => {
            const beforeRange = idx + 1 < fn.startLine;
            const isRange = idx + 1 === fn.startLine;
            const afterRange = idx + 1 >= fn.endLine;

            if (beforeRange || afterRange) {
              return [...updated, line];
            }

            return isRange ? [...updated, new_contents] : updated;
          }, [] as string[])
          .join("\n");
      }
    );

    writeFile(opts.network?.state.data.repo || "", filename, updated || "");
    return new_contents;
  },
});

//
// Utility functions
//

export const readFile = (repo: string, filename: string) => {
  return fs.readFileSync(path.join(WORKING_DIR, repo, filename)).toString();
};
export const writeFile = (repo: string, filename: string, content: string) => {
  return fs.writeFileSync(
    path.join(WORKING_DIR, repo, filename),
    content,
    "utf-8"
  );
};

export const parseClassAndFns = (contents: string) => {
  const parser = new Parser();
  parser.setLanguage(Py as Parser.Language);

  const tree = parser.parse(contents);
  const cursor = tree.walk();

  const results = {
    classes: [] as PyClass[],
    functions: [] as PyFn[],
  };

  // Helper to get the full function name and parameters
  const getFunctionDetails = (node: Parser.SyntaxNode): PyFn => {
    const nameNode = node.childForFieldName("name");
    const parametersNode = node.childForFieldName("parameters");
    return {
      name: nameNode?.text || "<unknown>",
      parameters: parametersNode?.text || "",
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      body: "", //node.text
    };
  };

  const getClassMethods = (classNode: Parser.SyntaxNode) => {
    const methods: PyFn[] = [];

    const body = classNode.childForFieldName("body");
    if (!body) {
      return methods;
    }

    const cursor = body.walk();
    cursor.gotoFirstChild();

    do {
      if (cursor.nodeType === "function_definition") {
        methods.push(getFunctionDetails(cursor.currentNode));
      }
    } while (cursor.gotoNextSibling());

    return methods;
  };

  cursor.gotoFirstChild();
  do {
    const node = cursor.currentNode;
    if (!node) {
      continue;
    }

    switch (node.type) {
      case "function_definition": {
        // Only process top-level functions
        if (node.parent === tree.rootNode) {
          results.functions.push(getFunctionDetails(node));
        }
        break;
      }

      case "class_definition": {
        const classInfo: PyClass = {
          name: node.childForFieldName("name")?.text || "<unknown>",
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          methods: getClassMethods(node),
        };
        results.classes.push(classInfo);
        break;
      }
    }
  } while (cursor.gotoNextSibling());

  return results;
};
