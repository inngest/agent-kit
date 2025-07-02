import type { Message } from "./types";
import type { MaybePromise } from "./util";

// Define tiktoken types locally to avoid adding it as a dependency
interface TiktokenEncoder {
  encode(text: string): number[];
  decode(tokens: number[]): Uint8Array;
}

interface Tiktoken {
  get_encoding(encoding: string): TiktokenEncoder;
}

/**
 * Base class for history processors that transform message arrays before they are sent to the LLM.
 * Processors are executed in sequence, with the output of one processor becoming the input of the next.
 */
export abstract class HistoryProcessor {
  public readonly name: string;

  constructor(options: { name: string }) {
    this.name = options.name;
  }

  /**
   * Process the messages array. Must be side-effect-free and return a new array.
   * @param messages - The messages to process
   * @returns The processed messages
   */
  abstract process(messages: Message[]): MaybePromise<Message[]>;
}

/**
 * Options for the ToolCallFilter processor
 */
export type ToolCallFilterOptions =
  | { include: string[]; exclude?: never; persistResults?: boolean }
  | { exclude: string[]; include?: never; persistResults?: boolean }
  | { include?: never; exclude?: never; persistResults?: boolean };

/**
 * Processor that filters out tool calls and results from message history.
 * Can be configured to include only specific tools, exclude specific tools, or exclude all tools.
 * Optionally replaces filtered tool calls with summary messages.
 */
export class ToolCallFilter extends HistoryProcessor {
  private readonly options: ToolCallFilterOptions;

  constructor(options: ToolCallFilterOptions = {}) {
    super({ name: "ToolCallFilter" });
    this.options = options;
  }

  process(messages: Message[]): Message[] {
    const { include, exclude, persistResults = false } = this.options;

    // Case 1: Include only specific tools
    if (include && include.length > 0) {
      return this.filterByInclude(messages, include, persistResults);
    }

    // Case 2: Exclude specific tools (or all if no exclude array provided)
    const toolsToExclude = exclude || "all";
    return this.filterByExclude(messages, toolsToExclude, persistResults);
  }

  private filterByInclude(
    messages: Message[],
    include: string[],
    persistResults: boolean
  ): Message[] {
    const result: Message[] = [];
    const excludedToolCallIds = new Set<string>();

    for (const message of messages) {
      if (message.type === "tool_call") {
        // Check if any tools in this message should be excluded
        const toolsToKeep = message.tools.filter((tool) =>
          include.includes(tool.name)
        );
        const toolsToExclude = message.tools.filter(
          (tool) => !include.includes(tool.name)
        );

        // Track excluded tool call IDs
        toolsToExclude.forEach((tool) => excludedToolCallIds.add(tool.id));

        if (toolsToKeep.length > 0) {
          // Keep the message but only with included tools
          result.push({
            ...message,
            tools: toolsToKeep,
          });
        } else if (persistResults && toolsToExclude.length > 0) {
          // Replace with summary message
          const summary = this.createSummaryMessage(toolsToExclude);
          result.push(summary);
        }
      } else if (message.type === "tool_result") {
        // Only keep tool results for tools that weren't excluded
        if (!excludedToolCallIds.has(message.tool.id)) {
          result.push(message);
        }
      } else {
        // Keep all other message types
        result.push(message);
      }
    }

    return result;
  }

  private filterByExclude(
    messages: Message[],
    exclude: string[] | "all",
    persistResults: boolean
  ): Message[] {
    const result: Message[] = [];
    const excludedToolCallIds = new Set<string>();

    for (const message of messages) {
      if (message.type === "tool_call") {
        if (exclude === "all") {
          // Exclude all tool calls
          message.tools.forEach((tool) => excludedToolCallIds.add(tool.id));
          if (persistResults) {
            const summary = this.createSummaryMessage(message.tools);
            result.push(summary);
          }
        } else {
          // Exclude specific tools
          const toolsToKeep = message.tools.filter(
            (tool) => !exclude.includes(tool.name)
          );
          const toolsToExclude = message.tools.filter((tool) =>
            exclude.includes(tool.name)
          );

          // Track excluded tool call IDs
          toolsToExclude.forEach((tool) => excludedToolCallIds.add(tool.id));

          if (toolsToKeep.length > 0) {
            result.push({
              ...message,
              tools: toolsToKeep,
            });
          }

          if (persistResults && toolsToExclude.length > 0) {
            const summary = this.createSummaryMessage(toolsToExclude);
            result.push(summary);
          }
        }
      } else if (message.type === "tool_result") {
        // Only keep tool results for tools that weren't excluded
        if (!excludedToolCallIds.has(message.tool.id)) {
          result.push(message);
        }
      } else {
        // Keep all other message types
        result.push(message);
      }
    }

    return result;
  }

  private createSummaryMessage(
    tools: Array<{ name: string; input: Record<string, unknown> }>
  ): Message {
    const toolNames = tools.map((t) => t.name).join(", ");
    const summary =
      tools.length === 1
        ? `Used **${tools[0]!.name}** tool`
        : `Used tools: ${toolNames}`;

    return {
      type: "text",
      role: "assistant",
      content: summary,
      stop_reason: "stop",
    };
  }
}

/**
 * Supported tokenizer encodings with type safety
 */
export type TokenizerEncoding =
  | "o200k_base" // GPT-4o, GPT-4o-mini
  | "cl100k_base" // GPT-4, GPT-3.5-turbo, text-embedding-ada-002
  | "p50k_base" // Codex models, text-davinci-002, text-davinci-003
  | "r50k_base" // GPT-3 models (davinci, curie, babbage, ada)
  | "gpt2"; // GPT-2 models

/**
 * Token counting function interface
 */
export type TokenCounter = (text: string) => number;

/**
 * Tokenizer implementation interface
 */
export interface Tokenizer {
  readonly encoding: TokenizerEncoding;
  count(text: string): number;
  encode?(text: string): number[];
  decode?(tokens: number[]): string;
}

/**
 * Simple character-based approximation tokenizer (fallback)
 */
export class ApproximateTokenizer implements Tokenizer {
  readonly encoding: TokenizerEncoding;
  private readonly charsPerToken: number;

  constructor(encoding: TokenizerEncoding = "o200k_base") {
    this.encoding = encoding;
    // Different encodings have different character densities
    this.charsPerToken = this.getCharsPerToken(encoding);
  }

  private getCharsPerToken(encoding: TokenizerEncoding): number {
    // Approximate characters per token for different encodings
    // These are rough estimates based on English text
    switch (encoding) {
      case "o200k_base":
        return 4.2; // GPT-4o tends to be more efficient
      case "cl100k_base":
        return 4.0; // GPT-4 standard
      case "p50k_base":
        return 3.8; // Code-focused models
      case "r50k_base":
        return 3.5; // Older GPT-3 models
      case "gpt2":
        return 3.2; // GPT-2 is less efficient
      default:
        return 4.0;
    }
  }

  count(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }
}

/**
 * Factory for creating tokenizers with optional tiktoken support
 */
export class TokenizerFactory {
  private static tiktokenCache = new Map<TokenizerEncoding, Tokenizer>();

  /**
   * Create a tokenizer for the specified encoding.
   * Will use tiktoken if available, otherwise falls back to approximation.
   */
  static create(encoding: TokenizerEncoding = "o200k_base"): Tokenizer {
    // Try to use tiktoken if available
    const tiktokenizer = this.createTiktoken(encoding);
    if (tiktokenizer) {
      return tiktokenizer;
    }

    // Fall back to approximation
    return new ApproximateTokenizer(encoding);
  }

  /**
   * Create a tiktoken-based tokenizer if the library is available
   */
  private static createTiktoken(encoding: TokenizerEncoding): Tokenizer | null {
    try {
      // Try to load tiktoken dynamically

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tiktoken = require("tiktoken") as Tiktoken;

      if (this.tiktokenCache.has(encoding)) {
        return this.tiktokenCache.get(encoding)!;
      }

      const enc = tiktoken.get_encoding(encoding);
      const tokenizer: Tokenizer = {
        encoding,
        count: (text: string) => enc.encode(text).length,
        encode: (text: string) => enc.encode(text),
        decode: (tokens: number[]) =>
          new TextDecoder().decode(enc.decode(tokens)),
      };

      this.tiktokenCache.set(encoding, tokenizer);
      return tokenizer;
    } catch {
      // tiktoken not available, will fall back to approximation
      return null;
    }
  }

  /**
   * Check if tiktoken is available in the environment
   */
  static get hasTiktoken(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("tiktoken");
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Options for the TokenLimiter processor
 */
export interface TokenLimiterOptions {
  /** Maximum number of tokens to allow in the history */
  limit: number;

  /** Tokenizer encoding to use - provides autocomplete and type safety */
  encoding?: TokenizerEncoding;

  /** Custom tokenizer implementation (overrides encoding) */
  tokenizer?: Tokenizer;

  /**
   * Whether to use tiktoken if available (default: true)
   * Set to false to force approximation tokenizer
   */
  useTiktoken?: boolean;
}

/**
 * Processor that limits the total number of tokens in the message history.
 * Removes the oldest messages until the total token count is below the specified limit.
 *
 * Supports multiple tokenizer backends:
 * - tiktoken (accurate, requires optional dependency)
 * - Approximation (fast, built-in fallback)
 *
 * @example
 * ```typescript
 * // Use default tokenizer (tiktoken if available, approximation otherwise)
 * new TokenLimiter(8000)
 *
 * // Specify encoding with type safety
 * new TokenLimiter({ limit: 8000, encoding: "cl100k_base" })
 *
 * // Force approximation tokenizer
 * new TokenLimiter({ limit: 8000, useTiktoken: false })
 *
 * // Use custom tokenizer
 * const customTokenizer = new MyCustomTokenizer();
 * new TokenLimiter({ limit: 8000, tokenizer: customTokenizer })
 * ```
 */
export class TokenLimiter extends HistoryProcessor {
  private readonly limit: number;
  private readonly tokenizer: Tokenizer;

  constructor(limitOrOptions: number | TokenLimiterOptions) {
    super({ name: "TokenLimiter" });

    if (typeof limitOrOptions === "number") {
      this.limit = limitOrOptions;
      this.tokenizer = TokenizerFactory.create("o200k_base");
    } else {
      const {
        limit,
        encoding = "o200k_base",
        tokenizer,
        useTiktoken = true,
      } = limitOrOptions;
      this.limit = limit;

      if (tokenizer) {
        // Use provided custom tokenizer
        this.tokenizer = tokenizer;
      } else if (useTiktoken) {
        // Use tiktoken if available, fallback to approximation
        this.tokenizer = TokenizerFactory.create(encoding);
      } else {
        // Force approximation tokenizer
        this.tokenizer = new ApproximateTokenizer(encoding);
      }
    }
  }

  /**
   * Get information about the tokenizer being used
   */
  get info() {
    return {
      encoding: this.tokenizer.encoding,
      type: this.tokenizer.constructor.name,
      hasTiktoken: TokenizerFactory.hasTiktoken,
    };
  }

  process(messages: Message[]): Message[] {
    const getMessageTokenCount = (message: Message): number => {
      switch (message.type) {
        case "text":
          return this.tokenizer.count(
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content)
          );
        case "tool_call":
          return this.tokenizer.count(JSON.stringify(message.tools));
        case "tool_result":
          return this.tokenizer.count(JSON.stringify(message.content));
        default:
          return 0;
      }
    };

    // Group messages into segments, ensuring tool_call/tool_result pairs stay together
    const segments: { messages: Message[]; tokenCount: number }[] = [];
    let currentSegment: Message[] = [];
    const pendingToolCallIds = new Set<string>();

    for (const message of messages) {
      currentSegment.push(message);

      if (message.type === "tool_call") {
        // Track tool call IDs that need corresponding results
        message.tools.forEach((tool) => pendingToolCallIds.add(tool.id));
      } else if (message.type === "tool_result") {
        // Remove the tool call ID as it now has a result
        pendingToolCallIds.delete(message.tool.id);
      }

      // If we have no pending tool calls, we can close this segment
      if (pendingToolCallIds.size === 0 && currentSegment.length > 0) {
        const segmentTokenCount = currentSegment.reduce(
          (sum, msg) => sum + getMessageTokenCount(msg),
          0
        );
        segments.push({
          messages: [...currentSegment],
          tokenCount: segmentTokenCount,
        });
        currentSegment = [];
      }
    }

    // Handle any remaining messages in the current segment
    if (currentSegment.length > 0) {
      const segmentTokenCount = currentSegment.reduce(
        (sum, msg) => sum + getMessageTokenCount(msg),
        0
      );
      segments.push({
        messages: [...currentSegment],
        tokenCount: segmentTokenCount,
      });
    }

    // Calculate total tokens
    const totalTokens = segments.reduce(
      (sum, segment) => sum + segment.tokenCount,
      0
    );

    // If we're under the limit, return all messages
    if (totalTokens <= this.limit) {
      return messages;
    }

    // Work backwards from newest segments, keeping complete segments that fit
    let currentTokens = 0;
    const segmentsToKeep: typeof segments = [];

    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i]!;
      if (currentTokens + segment.tokenCount <= this.limit) {
        segmentsToKeep.unshift(segment);
        currentTokens += segment.tokenCount;
      } else {
        // This segment would exceed the limit, so we stop here
        break;
      }
    }

    // Flatten the kept segments back into a message array
    return segmentsToKeep.flatMap((segment) => segment.messages);
  }
}

/**
 * Apply a sequence of processors to a message array
 */
export async function applyProcessors(
  messages: Message[],
  processors: HistoryProcessor[]
): Promise<Message[]> {
  let result = messages;

  for (const processor of processors) {
    result = await processor.process(result);
  }

  return result;
}
