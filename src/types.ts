import { type output as ZodOutput } from "zod";
import { type Agent } from "./agent";
import { type NetworkRun } from "./networkRun";
import { type AnyZodType, type MaybePromise } from "./util";

export type Tool<T extends AnyZodType> = {
  name: string;
  description?: string;
  parameters?: T;

  // TODO: Handler input types based off of JSON above.
  //
  // Handlers get their input arguments from inference calls, and can also
  // access the current agent and network.  This allows tools to reference and
  // schedule future work via the network, if necessary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: ZodOutput<T>, opts: ToolHandlerArgs) => MaybePromise<any>;
};

export namespace Tool {
  export type Any = Tool<AnyZodType>;

  export type Choice = "auto" | "any" | (string & {});
}

export type ToolHandlerArgs = {
  agent: Agent;
  network?: NetworkRun;
};
