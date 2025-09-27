/**
 * AgentKit Streaming System
 *
 * This module provides automatic event streaming capabilities for AgentKit networks and agents.
 * It defines the event schema that matches the useAgent hook expectations and provides
 * streaming context management for transparent event publishing.
 */

import { type Inngest } from "inngest";
import { type GetStepTools } from "inngest";
import { type State, type StateData } from "./state";
import { z } from "zod";

/**
 * Base interface for all streaming events
 */
export interface AgentMessageChunk {
  /** The event name (e.g., "run.started", "part.created") */
  event: string;
  /** Event-specific data payload */
  data: Record<string, unknown>;
  /** When the event occurred (Unix timestamp) */
  timestamp: number;
  /** Monotonic sequence number for ordering events */
  sequenceNumber: number;
  /** Suggested Inngest step ID for optional developer use */
  id: string;
}

/**
 * Canonical runtime schema for AgentKit streaming events.
 * Matches the AgentMessageChunk interface above.
 */
export const AgentMessageChunkSchema = z.object({
  event: z.string(),
  data: z.record(z.string(), z.any()),
  timestamp: z.number(),
  sequenceNumber: z.number(),
  id: z.string(),
});

// =============================================================================
// RUN LIFECYCLE EVENTS
// =============================================================================

export interface RunStartedEvent extends AgentMessageChunk {
  event: "run.started";
  data: {
    runId: string; // Unique identifier for this run
    parentRunId?: string; // If this is a nested run (e.g., agent within network)
    scope: "network" | "agent"; // Level of execution
    name: string; // Name of the network or agent
    messageId?: string; // Optional message context
    threadId?: string; // Thread context
    metadata?: Record<string, unknown>; // Additional context
  };
}

export interface RunCompletedEvent extends AgentMessageChunk {
  event: "run.completed";
  data: {
    runId: string;
    scope: "network" | "agent";
    name: string;
    messageId?: string; // Optional message context
    result?: unknown; // Final result from the run
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      thinkingTokens?: number; // For models with reasoning
    };
  };
}

export interface RunFailedEvent extends AgentMessageChunk {
  event: "run.failed";
  data: {
    runId: string;
    scope: "network" | "agent";
    name: string;
    messageId?: string; // Optional message context
    error: string;
    recoverable: boolean;
    metadata?: Record<string, unknown>;
  };
}

export interface RunInterruptedEvent extends AgentMessageChunk {
  event: "run.interrupted";
  data: {
    runId: string;
    scope: "network" | "agent";
    name: string;
    reason: "max_tokens" | "user_cancellation" | "timeout" | "other";
    metadata?: Record<string, unknown>;
  };
}

// =============================================================================
// STEP LIFECYCLE EVENTS
// =============================================================================

export interface StepStartedEvent extends AgentMessageChunk {
  event: "step.started";
  data: {
    stepId: string; // Unique identifier for this step
    runId: string; // Which run this step belongs to
    description?: string; // Human-readable description
    metadata?: Record<string, unknown>;
  };
}

export interface StepCompletedEvent extends AgentMessageChunk {
  event: "step.completed";
  data: {
    stepId: string;
    runId: string;
    result?: unknown; // Step result if applicable
    duration?: number; // Execution time in milliseconds
  };
}

export interface StepFailedEvent extends AgentMessageChunk {
  event: "step.failed";
  data: {
    stepId: string;
    runId: string;
    error: string;
    recoverable: boolean;
    retryAttempt?: number;
  };
}

// =============================================================================
// PART LIFECYCLE EVENTS
// =============================================================================

export interface PartCreatedEvent extends AgentMessageChunk {
  event: "part.created";
  data: {
    partId: string; // Unique identifier for this part
    runId: string; // Which run this part belongs to
    messageId: string; // Which message this part belongs to
    type:
      | "text"
      | "tool-call"
      | "tool-output"
      | "reasoning"
      | "data"
      | "file"
      | "refusal";
    metadata?: {
      toolName?: string; // For tool-call parts
      dataType?: string; // For data parts
      mimeType?: string; // For file parts
      agentName?: string; // For tracking which agent created this part
    };
  };
}

export interface PartCompletedEvent extends AgentMessageChunk {
  event: "part.completed";
  data: {
    partId: string;
    runId: string;
    messageId: string; // Which message this part belongs to
    type: string;
    finalContent: unknown; // The complete, aggregated content of this part
    metadata?: {
      toolName?: string; // For tool-call/tool-output parts
      dataType?: string; // For data parts
      mimeType?: string; // For file parts
      agentName?: string; // For tracking which agent created this part
    };
  };
}

export interface PartFailedEvent extends AgentMessageChunk {
  event: "part.failed";
  data: {
    partId: string;
    runId: string;
    messageId: string; // Which message this part belongs to
    type: string;
    error: string;
    recoverable: boolean;
  };
}

// =============================================================================
// CONTENT DELTA EVENTS
// =============================================================================

export interface TextDeltaEvent extends AgentMessageChunk {
  event: "text.delta";
  data: {
    partId: string; // Which part this delta belongs to
    messageId: string; // Which message this delta belongs to
    delta: string; // The text chunk
  };
}

export interface ToolCallArgumentsDeltaEvent extends AgentMessageChunk {
  event: "tool_call.arguments.delta";
  data: {
    partId: string;
    messageId: string; // Which message this delta belongs to
    delta: string; // JSON string chunk
    toolName?: string; // Included on first delta
  };
}

export interface ToolCallOutputDeltaEvent extends AgentMessageChunk {
  event: "tool_call.output.delta";
  data: {
    partId: string;
    messageId: string; // Which message this delta belongs to
    delta: string; // Incremental tool output
  };
}

export interface ReasoningDeltaEvent extends AgentMessageChunk {
  event: "reasoning.delta";
  data: {
    partId: string; // Which part this delta belongs to
    messageId: string; // Which message this delta belongs to
    delta: string; // The reasoning/thinking content chunk
  };
}

export interface DataDeltaEvent extends AgentMessageChunk {
  event: "data.delta";
  data: {
    partId: string;
    messageId: string; // Which message this delta belongs to
    delta: unknown; // Incremental structured data
  };
}

// =============================================================================
// HUMAN-IN-THE-LOOP (HITL) EVENTS
// =============================================================================

export interface HitlRequestedEvent extends AgentMessageChunk {
  event: "hitl.requested";
  data: {
    requestId: string;
    runId: string; // Which run is requesting approval
    toolCalls: Array<{
      partId: string; // The tool-call part that needs approval
      toolName: string;
      toolInput: unknown;
    }>;
    expiresAt: string; // ISO timestamp
    metadata?: {
      reason?: string; // Why approval is needed
      riskLevel?: "low" | "medium" | "high";
    };
  };
}

export interface HitlResolvedEvent extends AgentMessageChunk {
  event: "hitl.resolved";
  data: {
    requestId: string;
    runId: string;
    resolution: "approved" | "denied" | "partial";
    approvedTools?: string[]; // For partial approval
    reason?: string;
    resolvedBy: string; // User ID who resolved
    resolvedAt: string; // ISO timestamp
  };
}

// =============================================================================
// METADATA AND CONTROL EVENTS
// =============================================================================

export interface UsageUpdatedEvent extends AgentMessageChunk {
  event: "usage.updated";
  data: {
    runId: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      thinkingTokens?: number;
    };
    cumulative: boolean; // Whether this is cumulative or delta
  };
}

export interface MetadataUpdatedEvent extends AgentMessageChunk {
  event: "metadata.updated";
  data: {
    runId: string;
    metadata: Record<string, unknown>;
    type: "model_switch" | "parameter_change" | "context_update" | "other";
  };
}

export interface StreamEndedEvent extends AgentMessageChunk {
  event: "stream.ended";
  data: {
    scope: "network" | "agent";
    messageId?: string; // Optional message context
  };
}

// Legacy/generic error event for backward compatibility
export interface GenericErrorEvent extends AgentMessageChunk {
  event: "error";
  data: {
    error: string;
    agentId?: string;
    recoverable?: boolean;
    messageId?: string;
  };
}

// =============================================================================
// SEQUENCE COUNTER FOR SHARED STREAMING CONTEXTS
// =============================================================================

/**
 * A simple sequence counter that can be shared between streaming contexts
 * to ensure events are numbered correctly across related contexts
 */
class SequenceCounter {
  private value: number = 0;

  getNext(): number {
    return this.value++;
  }

  current(): number {
    return this.value;
  }
}

// =============================================================================
// STREAMING CONFIGURATION AND CONTEXT
// =============================================================================

/**
 * Public-facing streaming configuration interface
 */
export interface StreamingConfig {
  /** Function to publish events to the client */
  publish: (chunk: AgentMessageChunk) => Promise<void>;
  /** When true, emit simulated chunked deltas; otherwise emit a single delta */
  simulateChunking?: boolean;
}

/**
 * Internal streaming context that manages state and sequence numbers
 */
export class StreamingContext {
  private publish: (chunk: AgentMessageChunk) => Promise<void>;
  private sequenceCounter: SequenceCounter;
  private debug: boolean;
  private simulateChunking: boolean;

  public readonly runId: string;
  public readonly parentRunId?: string;
  public readonly messageId: string;
  public readonly threadId?: string;
  public readonly userId?: string;
  public readonly scope: "network" | "agent";

  constructor(config: {
    publish: (chunk: AgentMessageChunk) => Promise<void>;
    runId: string;
    parentRunId?: string;
    messageId: string;
    threadId?: string;
    userId?: string;
    scope: "network" | "agent";
    sequenceCounter?: SequenceCounter;
    debug?: boolean;
    simulateChunking?: boolean;
  }) {
    this.publish = config.publish;
    this.runId = config.runId;
    this.parentRunId = config.parentRunId;
    this.messageId = config.messageId;
    this.threadId = config.threadId;
    this.userId = config.userId;
    this.scope = config.scope;
    this.sequenceCounter = config.sequenceCounter || new SequenceCounter();
    this.debug = config.debug ?? process.env.NODE_ENV === "development";
    this.simulateChunking = config.simulateChunking ?? false;
  }

  /**
   * Create a child streaming context for agent runs within network runs
   */
  createChildContext(agentRunId: string): StreamingContext {
    return new StreamingContext({
      publish: this.publish,
      runId: agentRunId,
      parentRunId: this.runId,
      messageId: this.messageId,
      threadId: this.threadId,
      userId: this.userId,
      scope: "agent",
      sequenceCounter: this.sequenceCounter, // Share the same counter
      debug: this.debug, // Inherit debug setting
      simulateChunking: this.simulateChunking,
    });
  }

  /**
   * Create a context with different messageId but shared sequence counter
   */
  createContextWithSharedSequence(config: {
    runId: string;
    messageId: string;
    scope: "network" | "agent";
  }): StreamingContext {
    return new StreamingContext({
      publish: this.publish,
      runId: config.runId,
      parentRunId: this.runId,
      messageId: config.messageId,
      threadId: this.threadId,
      userId: this.userId,
      scope: config.scope,
      sequenceCounter: this.sequenceCounter, // Share the same counter instance
      debug: this.debug, // Inherit debug setting
      simulateChunking: this.simulateChunking,
    });
  }

  /**
   * Extract context information from network state
   */
  static fromNetworkState(
    networkState: State<StateData>,
    config: {
      publish: (chunk: AgentMessageChunk) => Promise<void>;
      runId: string;
      messageId: string;
      scope: "network" | "agent";
      debug?: boolean;
      simulateChunking?: boolean;
    }
  ): StreamingContext {
    const debug = config.debug ?? process.env.NODE_ENV === "development";
    return new StreamingContext({
      publish: config.publish,
      runId: config.runId,
      messageId: config.messageId,
      threadId: networkState.threadId,
      userId:
        typeof (networkState.data as { userId?: unknown }).userId === "string"
          ? ((networkState.data as { userId?: unknown }).userId as string)
          : undefined,
      scope: config.scope,
      debug,
      simulateChunking: config.simulateChunking ?? false,
    });
  }

  /**
   * Publish an event with automatic sequence numbering.
   * Provides a stepId in the chunk for optional Inngest step wrapping by the developer.
   */
  async publishEvent(
    event: Omit<AgentMessageChunk, "timestamp" | "sequenceNumber" | "id">
  ): Promise<void> {
    // Get the next sequence number from the shared counter
    const sequenceNumber = this.sequenceCounter.getNext();

    // Generate step ID with the sequence number
    const stepId = this.generateStreamingStepId(event, sequenceNumber);

    // Automatically enrich event data with threadId and userId if they exist
    const enrichedData: Record<string, unknown> = { ...event.data };
    if (this.threadId) {
      enrichedData["threadId"] = this.threadId;
    }
    if (this.userId) {
      enrichedData["userId"] = this.userId;
    }

    const chunk: AgentMessageChunk = {
      ...event,
      data: enrichedData,
      timestamp: Date.now(),
      sequenceNumber,
      id: stepId,
    };

    try {
      await this.publish(chunk);
    } catch (err) {
      // Swallow publishing errors to avoid breaking execution; best-effort streaming

      console.warn(
        "[Streaming] Failed to publish event; continuing execution",
        {
          error: err instanceof Error ? err.message : String(err),
          event: chunk.event,
          sequenceNumber: chunk.sequenceNumber,
        }
      );
    }
  }

  /**
   * Generate intelligent step IDs for streaming events
   */
  private generateStreamingStepId(
    event: Omit<AgentMessageChunk, "timestamp" | "sequenceNumber" | "id">,
    sequenceNumber: number
  ): string {
    return `publish-${sequenceNumber}:${event.event}`;
  }

  /**
   * Generate a unique part ID for this streaming context
   * OpenAI requires tool call IDs to be ≤ 40 characters
   */
  generatePartId(): string {
    // Create shorter, OpenAI-compatible ID (≤ 40 chars)
    // Format: "tool_" + shortened messageId + timestamp suffix + random
    const shortMessageId = this.messageId.replace(/-/g, "").substring(0, 8); // 8 chars
    const shortTimestamp = Date.now().toString().slice(-8); // Last 8 digits
    const randomSuffix = Math.random().toString(36).substr(2, 6); // 6 chars

    // Format: "tool_" (5) + shortMessageId (8) + "_" (1) + shortTimestamp (8) + "_" (1) + randomSuffix (6) = 29 chars
    const partId = `tool_${shortMessageId}_${shortTimestamp}_${randomSuffix}`;
    return partId;
  }

  /**
   * Generate a unique step ID for this streaming context
   */
  generateStepId(baseName: string): string {
    return `step_${baseName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /** Returns whether simulated chunking is enabled for this context */
  isSimulatedChunking(): boolean {
    return this.simulateChunking;
  }
}

/**
 * Union type of all possible streaming events
 */
export type StreamingEvent =
  | RunStartedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunInterruptedEvent
  | StepStartedEvent
  | StepCompletedEvent
  | StepFailedEvent
  | PartCreatedEvent
  | PartCompletedEvent
  | PartFailedEvent
  | TextDeltaEvent
  | ToolCallArgumentsDeltaEvent
  | ToolCallOutputDeltaEvent
  | ReasoningDeltaEvent
  | DataDeltaEvent
  | HitlRequestedEvent
  | HitlResolvedEvent
  | UsageUpdatedEvent
  | MetadataUpdatedEvent
  | StreamEndedEvent
  | GenericErrorEvent;

/**
 * Type guard to check if an event is a specific type
 */
export function isEventType<T extends StreamingEvent>(
  event: AgentMessageChunk,
  eventType: T["event"]
): event is T {
  return event.event === eventType;
}

/**
 * Utility to generate unique IDs
 */
export function generateId(): string {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return id;
}

// =============================================================================
// STEP WRAPPER FOR TRANSPARENT EVENT PUBLISHING (Proxy-based)
// =============================================================================

/**
 * Helper function to create a StepWrapper if streaming context is available
 */
export function createStepWrapper(
  originalStep: GetStepTools<Inngest.Any> | undefined,
  context?: StreamingContext
): GetStepTools<Inngest.Any> | undefined {
  if (!context || !originalStep) {
    return originalStep;
  }

  // Use a Proxy to dynamically wrap the step tools
  return new Proxy(originalStep, {
    get(target, prop, receiver) {
      // If the property is one we want to wrap (e.g., 'run'), return our wrapped version.
      if (prop === "run") {
        return async <T>(stepId: string, fn: () => Promise<T>): Promise<T> => {
          // Delegate to the original Inngest step.run while emitting streaming events
          const originalRun = Reflect.get(
            target,
            "run",
            receiver
          ) as unknown as <R>(id: string, fn: () => Promise<R>) => Promise<R>;

          // Do not publish streaming step events here to avoid nested step.* within Inngest steps
          // Rely on the actual Inngest step.run for step visibility in the console
          return originalRun(stepId, fn);
        };
      }

      // For any other property, just reflect it from the original step object.
      return Reflect.get(
        target,
        prop,
        receiver
      ) as unknown as GetStepTools<Inngest.Any>[keyof GetStepTools<Inngest.Any>];
    },
  });
}
