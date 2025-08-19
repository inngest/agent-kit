/**
 * AgentKit Streaming System
 * 
 * This module provides automatic event streaming capabilities for AgentKit networks and agents.
 * It defines the event schema that matches the useAgent hook expectations and provides 
 * streaming context management for transparent event publishing.
 */

/**
 * Base interface for all streaming events
 */
export interface AgentMessageChunk {
  /** The event name (e.g., "run.started", "part.created") */
  event: string;
  /** Event-specific data payload */
  data: Record<string, any>;
  /** When the event occurred (Unix timestamp) */
  timestamp: number;
  /** Monotonic sequence number for ordering events */
  sequenceNumber: number;
  /** Suggested Inngest step ID for optional developer use */
  id: string;
}

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
    metadata?: Record<string, any>; // Additional context
  };
}

export interface RunCompletedEvent extends AgentMessageChunk {
  event: "run.completed";
  data: {
    runId: string;
    scope: "network" | "agent";
    name: string;
    messageId?: string; // Optional message context
    result?: any; // Final result from the run
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
    metadata?: Record<string, any>;
  };
}

export interface RunInterruptedEvent extends AgentMessageChunk {
  event: "run.interrupted";
  data: {
    runId: string;
    scope: "network" | "agent";
    name: string;
    reason: "max_tokens" | "user_cancellation" | "timeout" | "other";
    metadata?: Record<string, any>;
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
    metadata?: Record<string, any>;
  };
}

export interface StepCompletedEvent extends AgentMessageChunk {
  event: "step.completed";
  data: {
    stepId: string;
    runId: string;
    result?: any; // Step result if applicable
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
    type: "text" | "tool-call" | "tool-output" | "reasoning" | "data" | "file" | "refusal";
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
    finalContent: any; // The complete, aggregated content of this part
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
    delta: any; // Incremental structured data
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
      toolInput: any;
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
    metadata: Record<string, any>;
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
}

/**
 * Internal streaming context that manages state and sequence numbers
 */
export class StreamingContext {
  private publish: (chunk: AgentMessageChunk) => Promise<void>;
  private sequenceCounter: SequenceCounter;
  private debug: boolean;
  
  public readonly runId: string;
  public readonly parentRunId?: string;
  public readonly messageId: string;
  public readonly threadId?: string;
  public readonly scope: "network" | "agent";

  constructor(config: {
    publish: (chunk: AgentMessageChunk) => Promise<void>;
    runId: string;
    parentRunId?: string;
    messageId: string;
    threadId?: string;
    scope: "network" | "agent";
    sequenceCounter?: SequenceCounter;
    debug?: boolean;
  }) {
    this.publish = config.publish;
    this.runId = config.runId;
    this.parentRunId = config.parentRunId;
    this.messageId = config.messageId;
    this.threadId = config.threadId;
    this.scope = config.scope;
    this.sequenceCounter = config.sequenceCounter || new SequenceCounter();
    this.debug = config.debug ?? (process.env.NODE_ENV === 'development');
  }

  /**
   * Create a child streaming context for agent runs within network runs
   */
  createChildContext(agentRunId: string): StreamingContext {
    if (this.debug) {
      console.log("🔧 [CHILD-CTX] Creating child context:", {
        parentRunId: this.runId,
        childRunId: agentRunId,
        inheritedMessageId: this.messageId,
        scope: "agent",
        timestamp: new Date().toISOString()
      });
    }
    return new StreamingContext({
      publish: this.publish,
      runId: agentRunId,
      parentRunId: this.runId,
      messageId: this.messageId,
      threadId: this.threadId,
      scope: "agent",
      sequenceCounter: this.sequenceCounter, // Share the same counter
      debug: this.debug, // Inherit debug setting
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
      scope: config.scope,
      sequenceCounter: this.sequenceCounter, // Share the same counter instance
      debug: this.debug, // Inherit debug setting
    });
  }

  /**
   * Extract context information from network state
   */
  static fromNetworkState<T extends Record<string, any>>(
    networkState: T,
    config: {
      publish: (chunk: AgentMessageChunk) => Promise<void>;
      runId: string;
      messageId: string;
      scope: "network" | "agent";
      debug?: boolean;
    }
  ): StreamingContext {
    const debug = config.debug ?? (process.env.NODE_ENV === 'development');
    if (debug) {
      console.log("🔧 [STREAMING-CTX] Creating StreamingContext with:", {
        runId: config.runId,
        messageId: config.messageId,
        scope: config.scope,
        threadId: networkState.threadId,
        timestamp: new Date().toISOString()
      });
    }
    return new StreamingContext({
      publish: config.publish,
      runId: config.runId,
      messageId: config.messageId,
      threadId: networkState.threadId,
      scope: config.scope,
      debug,
    });
  }

  /**
   * Publish an event with automatic sequence numbering.
   * Provides a stepId in the chunk for optional Inngest step wrapping by the developer.
   */
  async publishEvent(event: Omit<AgentMessageChunk, 'timestamp' | 'sequenceNumber' | 'id'>): Promise<void> {
    // Get the next sequence number from the shared counter
    const sequenceNumber = this.sequenceCounter.getNext();
    
    // Generate step ID with the sequence number
    const stepId = this.generateStreamingStepId(event, sequenceNumber);
    
    const chunk: AgentMessageChunk = {
      ...event,
      timestamp: Date.now(),
      sequenceNumber,
      id: stepId,
    };

    try {
      await this.publish(chunk);
    } catch (err) {
      // Swallow publishing errors to avoid breaking execution; best-effort streaming
      // eslint-disable-next-line no-console
      console.warn("[Streaming] Failed to publish event; continuing execution", {
        error: err instanceof Error ? err.message : String(err),
        event: chunk.event,
        sequenceNumber: chunk.sequenceNumber,
      });
    }
  }



  /**
   * Generate intelligent step IDs for streaming events
   */
  private generateStreamingStepId(event: Omit<AgentMessageChunk, 'timestamp' | 'sequenceNumber' | 'id'>, sequenceNumber: number): string {
    return `publish-${sequenceNumber}:${event.event}`;
  }



  /**
   * Generate a unique part ID for this streaming context
   */
  generatePartId(): string {
    const partId = `part_${this.messageId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (this.debug) {
      console.log("🔧 [PART-ID] Generated partId:", partId, "for messageId:", this.messageId, "at", new Date().toISOString());
      console.trace("🔧 [PART-ID] Call stack for partId generation");
    }
    return partId;
  }

  /**
   * Generate a unique step ID for this streaming context
   */
  generateStepId(baseName: string): string {
    return `step_${baseName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
  eventType: T['event']
): event is T {
  return event.event === eventType;
}

/**
 * Utility to generate unique IDs
 */
export function generateId(debug?: boolean): string {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const isDebug = debug ?? (process.env.NODE_ENV === 'development');
  if (isDebug) {
    console.log("🔧 [ID-GEN] Generated new ID:", id, "at", new Date().toISOString());
    console.trace("🔧 [ID-GEN] Call stack for ID generation");
  }
  return id;
}

// =============================================================================
// STEP WRAPPER FOR TRANSPARENT EVENT PUBLISHING
// =============================================================================

/**
 * StepWrapper acts as a proxy around the Inngest step object to automatically
 * publish step lifecycle events without requiring developers to modify their code.
 */
export class StepWrapper {
  private originalStep: any;
  private context: StreamingContext;

  constructor(originalStep: any, context: StreamingContext) {
    this.originalStep = originalStep;
    this.context = context;
    
    // Create proxy to intercept all method calls
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        // Return bound methods from our wrapper
        if (prop in target && typeof target[prop as keyof StepWrapper] === 'function') {
          return Reflect.get(target, prop, receiver);
        }
        
        // Handle the 'ai' property specially
        if (prop === 'ai') {
          return target.createAiWrapper();
        }
        
        // For known step methods, wrap them
        const knownStepMethods = ['run', 'sleep', 'invoke', 'waitForEvent', 'sendEvent', 'sleepUntil'];
        if (knownStepMethods.includes(prop as string)) {
          return target.wrapStepMethod(prop as string);
        }
        
        // For everything else, return the original property
        return Reflect.get(target.originalStep, prop);
      }
    });
  }

  /**
   * Wrap the 'run' method to emit step events
   */
  private wrapStepMethod(methodName: string) {
    return async (...args: any[]) => {
      const stepId = typeof args[0] === 'string' ? args[0] : `${methodName}-${generateId()}`;
      const startTime = Date.now();
      
      // Publish step_started before execution
      await this.context.publishEvent({
        event: "step.started",
        data: {
          stepId: stepId,
          runId: this.context.runId,
          description: `Executing ${methodName}: ${stepId}`,
          metadata: {
            method: methodName,
            args: args.slice(1) // Exclude stepId from args in metadata
          }
        }
      });

      try {
        // Execute the original step method
        const result = await this.originalStep[methodName](...args);

        // Calculate duration
        const duration = Date.now() - startTime;

        // Publish step_completed on success
        await this.context.publishEvent({
          event: "step.completed",
          data: {
            stepId: stepId,
            runId: this.context.runId,
            result: methodName === 'run' ? undefined : result, // Don't include result data for security
            duration: duration
          }
        });

        return result;
      } catch (error) {
        // Calculate duration even for failed steps
        const duration = Date.now() - startTime;

        // Publish step_failed on error
        await this.context.publishEvent({
          event: "step.failed",
          data: {
            stepId: stepId,
            runId: this.context.runId,
            error: error instanceof Error ? error.message : String(error),
            recoverable: true, // Most step failures are recoverable via retries
            retryAttempt: undefined, // TODO: Track retry attempts if needed
            duration: duration
          }
        });
        
        throw error; // Re-throw to maintain original behavior
      }
    };
  }

  /**
   * Create a wrapper for the AI inference methods
   */
  private createAiWrapper() {
    const wrapper = this;
    return {
      infer: async (stepId: string, options: any) => {
        const startTime = Date.now();
        
        // Publish step_started for AI inference
        await wrapper.context.publishEvent({
          event: "step.started",
          data: {
            stepId: stepId,
            runId: wrapper.context.runId,
            description: "AI inference",
            metadata: {
              method: "ai.infer",
              model: options?.model?.options?.model || "unknown"
            }
          }
        });

        try {
          // Call original AI inference method
          const result = await wrapper.originalStep.ai.infer(stepId, options);

          // Calculate duration
          const duration = Date.now() - startTime;

          // Publish step_completed
          await wrapper.context.publishEvent({
            event: "step.completed",
            data: {
              stepId: stepId,
              runId: wrapper.context.runId,
              duration: duration
            }
          });

          return result;
        } catch (error) {
          // Calculate duration even for failed AI calls
          const duration = Date.now() - startTime;

          // Publish step_failed on AI inference error
          await wrapper.context.publishEvent({
            event: "step.failed",
            data: {
              stepId: stepId,
              runId: wrapper.context.runId,
              error: error instanceof Error ? error.message : String(error),
              recoverable: true,
              duration: duration
            }
          });
          
          throw error;
        }
      },

      // Wrap ai.wrap method if it exists
      wrap: wrapper.originalStep.ai?.wrap ? async (...args: any[]) => {
        const stepId = typeof args[0] === 'string' ? args[0] : `ai-wrap-${generateId()}`;
        const startTime = Date.now();
        
        await wrapper.context.publishEvent({
          event: "step.started",
          data: {
            stepId: stepId,
            runId: wrapper.context.runId,
            description: "AI wrap operation",
            metadata: { method: "ai.wrap" }
          }
        });

        try {
          const result = await wrapper.originalStep.ai.wrap(...args);
          const duration = Date.now() - startTime;

          await wrapper.context.publishEvent({
            event: "step.completed",
            data: {
              stepId: stepId,
              runId: wrapper.context.runId,
              duration: duration
            }
          });

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;

          await wrapper.context.publishEvent({
            event: "step.failed",
            data: {
              stepId: stepId,
              runId: wrapper.context.runId,
              error: error instanceof Error ? error.message : String(error),
              recoverable: true,
              duration: duration
            }
          });
          
          throw error;
        }
      } : undefined
    };
  }

  /**
   * Direct access to original step for compatibility
   */
  get original() {
    return this.originalStep;
  }
}

/**
 * Helper function to create a StepWrapper if streaming context is available
 */
export function createStepWrapper(originalStep: any, context?: StreamingContext): any {
  if (!context || !originalStep) {
    return originalStep;
  }
  
  return new StepWrapper(originalStep, context);
}