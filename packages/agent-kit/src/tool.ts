import { type GetStepTools, type Inngest } from "inngest";
import { type output as ZodOutput } from "zod";
import { type Agent } from "./agent";
import { type StateData } from "./state";
import { type NetworkRun } from "./network";
import { type AnyZodType, type MaybePromise } from "./util";
import type { StreamableHTTPReconnectionOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";

/**
 * ToolResultPayload mirrors the UI package shape for structured tool outputs.
 */
export type ToolResultPayload<T> = { data: T };

/**
 * createTool is a helper that properly types the input argument for a handler
 * based off of the Zod parameter types, and captures the handler output type.
 */
export function createTool<
  TName extends string,
  TInput extends Tool.Input,
  TOutput,
  TState extends StateData,
>({
  name,
  description,
  parameters,
  handler,
}: {
  name: TName;
  description?: string;
  parameters?: TInput;
  handler: (
    input: ZodOutput<TInput>,
    opts: Tool.Options<TState>
  ) => MaybePromise<TOutput>;
}): Tool<TName, TInput, TOutput> {
  return {
    name,
    description,
    parameters,
    handler<TS extends StateData>(
      input: ZodOutput<TInput>,
      opts: Tool.Options<TS>
    ): MaybePromise<TOutput> {
      return handler(input, opts as unknown as Tool.Options<TState>);
    },
  };
}

export type Tool<TName extends string, TInput extends Tool.Input, TOutput> = {
  name: TName;
  description?: string;
  parameters?: TInput;

  // mcp lists the MCP details for this tool, if this tool is provided by an
  // MCP server.
  mcp?: {
    server: MCP.Server;
    tool: MCP.Tool;
  };

  strict?: boolean;

  handler<TState extends StateData>(
    input: ZodOutput<TInput>,
    opts: Tool.Options<TState>
  ): MaybePromise<TOutput>;
};

export namespace Tool {
  export type Any = Tool<string, Tool.Input, unknown>;

  export type Options<T extends StateData> = {
    agent: Agent<T>;
    network: NetworkRun<T>;
    step?: GetStepTools<Inngest.Any>;
  };

  export type Input = AnyZodType;

  export type Choice = "auto" | "any" | (string & {});
}

/**
 * Helper to create a strongly-typed tool manifest from a list of tools.
 *
 * Returns a simple runtime object keyed by tool name. The primary value is the
 * compile-time type that captures each tool's input and output types.
 */
export function createToolManifest<
  TTools extends readonly Tool<string, Tool.Input, unknown>[],
>(tools: TTools) {
  const manifest: Record<string, { input: unknown; output: unknown }> = {};
  for (const t of tools) {
    // runtime structure is intentionally minimal; types carry the value
    manifest[t.name] = { input: {}, output: {} };
  }
  type Result = {
    [K in TTools[number] as K["name"] & string]: K extends Tool<
      string,
      infer In extends AnyZodType,
      infer Out
    >
      ? { input: ZodOutput<In>; output: ToolResultPayload<Out> }
      : never;
  };
  return manifest as Result;
}

export namespace MCP {
  export type Server = {
    // name is a short name for the MCP server, eg. "github".  This allows
    // us to namespace tools for each MCP server.
    name: string;
    transport:
      | TransportSSE
      | TransportWebsocket
      | TransportStreamableHttp
      | TransportStdio;
    // Optional server-specific tool filtering
    includeTools?: (string | RegExp)[];
    excludeTools?: (string | RegExp)[];
  };

  export type Transport =
    | TransportSSE
    | TransportWebsocket
    | TransportStreamableHttp
    | TransportStdio;

  export type TransportStreamableHttp = {
    type: "streamable-http";
    url: string;
    requestInit?: RequestInit;
    reconnectionOptions?: StreamableHTTPReconnectionOptions;
    sessionId?: string;
    authProvider?: OAuthClientProvider;
  };

  export type TransportStdio = {
    type: "stdio";
    command: string;
    args: string[];
    env?: Record<string, string>;
  };

  export type TransportSSE = {
    type: "sse";
    url: string;
    eventSourceInit?: EventSourceInit;
    requestInit?: RequestInit;
  };

  export type TransportWebsocket = {
    type: "ws";
    url: string;
  };

  export type Tool = {
    name: string;
    description?: string;
    inputSchema?: {
      type: "object";
      properties?: unknown;
    };
  };

  /**
   * Configuration for MCP tool filtering at the agent level.
   * These settings apply globally to all MCP servers connected to an agent.
   */
  export type Config = {
    /**
     * Include list - if provided, only tools matching these patterns are loaded.
     * Supports both exact string matches and regular expressions.
     * Applied first as an allowlist.
     */
    includeTools?: (string | RegExp)[];

    /**
     * Exclude list - tools matching these patterns will not be loaded.
     * Supports both exact string matches and regular expressions.
     * Applied after includeTools, so exclude patterns take precedence for safety.
     * If a tool matches both include and exclude, it will be excluded.
     */
    excludeTools?: (string | RegExp)[];
  };
}
