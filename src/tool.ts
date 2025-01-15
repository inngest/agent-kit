import { type GetStepTools, type Inngest } from "inngest";
import { type output as ZodOutput } from "zod";
import { type Agent } from "./agent";
import { type NetworkRun } from "./networkRun";
import { type AnyZodType, type MaybePromise } from "./util";

export type Tool<TInput extends Tool.Input> = {
  name: string;
  description?: string;
  parameters?: TInput;

  // TODO: Handler input types based off of JSON above.
  //
  // Handlers get their input arguments from inference calls, and can also
  // access the current agent and network.  This allows tools to reference and
  // schedule future work via the network, if necessary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: ZodOutput<TInput>, opts: Tool.Options) => MaybePromise<any>;
};

export namespace Tool {
  export type Any = Tool<Tool.Input>;

  export type Options = {
    agent: Agent;
    network?: NetworkRun;
    step: GetStepTools<Inngest.Any>;
  };

  export type Input = AnyZodType;

  export type Choice = "auto" | "any" | (string & {});
}
