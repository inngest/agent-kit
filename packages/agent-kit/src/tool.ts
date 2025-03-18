import { type GetStepTools, type Inngest } from "inngest";
import { type output as ZodOutput } from "zod";
import { type Agent } from "./agent";
import { State, type StateData } from "./state";
import { type NetworkRun } from "./networkRun";
import { type AnyZodType, type MaybePromise } from "./util";

/**
 * createTool is a helper that properly types the input argument for a handler
 * based off of the Zod parameter types.
 */
export function createTool<TInput extends Tool.Input, TState extends StateData>({
  name,
  description,
  parameters,
  handler,
}: {
  name: string;
  description?: string;
  parameters: TInput;
  handler: (input: ZodOutput<TInput>, opts: Tool.Options<TState>) => MaybePromise<any>;
}): Tool<TInput> {
  return {
    name,
    description,
    parameters,
    handler: handler as any as <TState extends StateData>(input: ZodOutput<TInput>, opts: Tool.Options<TState>) => MaybePromise<any>,
  };
}


export type Tool<TInput extends Tool.Input> = {
  name: string;
  description?: string;
  parameters?: TInput;

  // mcp lists the MCP details for this tool, if this tool is provided by an
  // MCP server.
  mcp?: {
    server: MCP.Server;
    tool: MCP.Tool;
  };

  strict?: boolean;

  handler: <TState extends StateData>(
    input: ZodOutput<TInput>,
    opts: Tool.Options<TState>
  ) => MaybePromise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export namespace Tool {
  export type Any = Tool<Tool.Input>;

  export type Options<T extends StateData> = {
    agent: Agent<T>;
    network: NetworkRun<T>;
    step?: GetStepTools<Inngest.Any>;
  };

  export type Input = AnyZodType;

  export type Choice = "auto" | "any" | (string & {});
}

export namespace MCP {
  export type Server = {
    // name is a short name for the MCP server, eg. "github".  This allows
    // us to namespace tools for each MCP server.
    name: string;
    transport: TransportSSE | TransportWebsocket;
  };

  export type Transport = TransportSSE | TransportWebsocket;

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
}
