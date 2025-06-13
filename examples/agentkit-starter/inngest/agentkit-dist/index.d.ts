import { M as Message, T as Tool } from './agent-QzIKahV1.js';
export { A as Agent, u as AgentResult, k as AnyZodType, v as History, H as HistoryConfig, i as MCP, j as MaybePromise, N as Network, d as NetworkRun, R as RoutingAgent, x as SaveThreadToStorageConfig, f as State, S as StateData, r as TextContent, o as TextMessage, w as ThreadOperationConfig, p as ToolCallMessage, t as ToolMessage, q as ToolResultMessage, c as createAgent, b as createNetwork, a as createRoutingAgent, e as createState, h as createTool, g as getDefaultRoutingAgent, n as getInngestFnInput, l as getStepTools, y as initializeThread, m as isInngestFn, z as loadThreadFromStorage, B as saveThreadToStorage, s as stringifyError } from './agent-QzIKahV1.js';
import { AiAdapter } from '@inngest/ai';
export { anthropic, gemini, grok, openai } from '@inngest/ai';
import 'inngest/components/InngestFunction';
import 'inngest';
import 'zod';
import 'inngest/experimental';
import '@modelcontextprotocol/sdk/client/streamableHttp.js';
import '@modelcontextprotocol/sdk/client/auth.js';

declare const createAgenticModelFromAiAdapter: <TAiAdapter extends AiAdapter.Any>(adapter: TAiAdapter) => AgenticModel<TAiAdapter>;
declare class AgenticModel<TAiAdapter extends AiAdapter.Any> {
    #private;
    requestParser: AgenticModel.RequestParser<TAiAdapter>;
    responseParser: AgenticModel.ResponseParser<TAiAdapter>;
    constructor({ model, requestParser, responseParser, }: AgenticModel.Constructor<TAiAdapter>);
    infer(stepID: string, input: Message[], tools: Tool.Any[], tool_choice: Tool.Choice): Promise<AgenticModel.InferenceResponse>;
}
declare namespace AgenticModel {
    type Any = AgenticModel<AiAdapter.Any>;
    /**
     * InferenceResponse is the response from a model for an inference request.
     * This contains parsed messages and the raw result, with the type of the raw
     * result depending on the model's API repsonse.
     */
    type InferenceResponse<T = unknown> = {
        output: Message[];
        raw: T;
    };
    interface Constructor<TAiAdapter extends AiAdapter.Any> {
        model: TAiAdapter;
        requestParser: RequestParser<TAiAdapter>;
        responseParser: ResponseParser<TAiAdapter>;
    }
    type RequestParser<TAiAdapter extends AiAdapter.Any> = (model: TAiAdapter, state: Message[], tools: Tool.Any[], tool_choice: Tool.Choice) => AiAdapter.Input<TAiAdapter>;
    type ResponseParser<TAiAdapter extends AiAdapter.Any> = (output: AiAdapter.Output<TAiAdapter>) => Message[];
}

export { AgenticModel, Message, Tool, createAgenticModelFromAiAdapter };
