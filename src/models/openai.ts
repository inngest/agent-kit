import { openai as iopenai, type OpenAi } from 'inngest';
import { requestParser, responseParser } from '../adapters/openai';
import { AgenticModel } from '../model';
import { type AnyStepTools } from '../types';

export namespace AgenticOpenAiModel {
  export interface Options<TAiAdapter extends OpenAi.AiModel>
    extends Omit<OpenAi.AiModelOptions, 'model'> {
    /**
     * The OpenAI model to use.
     */
    model: OpenAi.AiModelOptions['model'] | TAiAdapter;

    /**
     * The step tools to use internally within this model.
     */
    step: AnyStepTools;
  }
}

/**
 * Create an agentic OpenAI model using the OpenAI chat format.
 *
 * By default it targets the `https://api.openai.com/v1/` base URL.
 */
export const openai = <TAiAdapter extends OpenAi.AiModel>({
  step,
  ...modelOptions
}: AgenticOpenAiModel.Options<TAiAdapter>) => {
  const model =
    typeof modelOptions.model === 'string'
      ? iopenai({ ...modelOptions, model: modelOptions.model })
      : modelOptions.model;

  return new AgenticModel({
    model,
    step,
    requestParser,
    responseParser,
  });
};
