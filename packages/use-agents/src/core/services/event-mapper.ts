import type { NetworkEvent, JsonObject } from "../../types/index.js";

/**
 * Map an incoming realtime chunk to our NetworkEvent shape.
 * Returns null if the payload is not a valid event-like object.
 */
export function mapToNetworkEvent(input: unknown): NetworkEvent | null {
  if (!input || typeof input !== "object") return null;
  let obj = input as JsonObject;
  // Unwrap common realtime envelope shapes: { channel, topic, data: { event, ... } }
  if (obj && typeof obj.data === "object" && obj.data !== null) {
    const inner = obj.data as JsonObject;
    if (typeof inner.event === "string") {
      obj = inner; // unwrap to inner event payload
    }
  }

  if (typeof obj.event !== "string") return null;
  if (typeof obj.timestamp !== "number") return null;
  if (typeof obj.sequenceNumber !== "number") return null;

  const data =
    obj.data && typeof obj.data === "object" ? (obj.data as JsonObject) : {};
  const id =
    typeof obj.id === "string" ? obj.id : `${obj.event}:${obj.sequenceNumber}`;

  // Build a typed event for known shapes; otherwise return a generic event
  switch (obj.event) {
    case "run.started": {
      return {
        event: obj.event,
        data: {
          threadId: data.threadId as string | undefined,
          name: data.name as string | undefined,
          scope: data.scope as string | undefined,
          parentRunId: data.parentRunId as string | undefined,
          runId: data.runId as string | undefined,
          messageId: data.messageId as string | undefined,
        },
        timestamp: obj.timestamp,
        sequenceNumber: obj.sequenceNumber,
        id,
      } as NetworkEvent;
    }
    case "run.completed":
    case "stream.ended": {
      return {
        event: obj.event,
        data: {
          threadId: data.threadId as string | undefined,
          scope: data.scope as string | undefined,
          runId: data.runId as string | undefined,
          messageId: data.messageId as string | undefined,
          name: data.name as string | undefined,
        },
        timestamp: obj.timestamp,
        sequenceNumber: obj.sequenceNumber,
        id,
      } as NetworkEvent;
    }
    case "part.created": {
      const type = data.type;
      const messageId = data.messageId;
      const partId = data.partId;
      if (type === "text" || type === "tool-call") {
        if (typeof messageId === "string" && typeof partId === "string") {
          return {
            event: obj.event,
            data: {
              threadId: data.threadId as string | undefined,
              messageId,
              partId,
              type,
              metadata: (typeof data.metadata === "object" &&
              data.metadata !== null
                ? (data.metadata as JsonObject)
                : undefined) as { toolName?: string } | undefined,
            },
            timestamp: obj.timestamp,
            sequenceNumber: obj.sequenceNumber,
            id,
          } as NetworkEvent;
        }
      }
      break;
    }
    case "text.delta": {
      const { messageId, partId, delta } = data as {
        messageId?: unknown;
        partId?: unknown;
        delta?: unknown;
      };
      if (
        typeof messageId === "string" &&
        typeof partId === "string" &&
        typeof delta === "string"
      ) {
        return {
          event: obj.event,
          data: {
            threadId: data.threadId as string | undefined,
            messageId,
            partId,
            delta,
          },
          timestamp: obj.timestamp,
          sequenceNumber: obj.sequenceNumber,
          id,
        } as NetworkEvent;
      }
      break;
    }
    case "tool_call.arguments.delta":
    case "tool_call.output.delta": {
      const { messageId, partId, delta } = data as {
        messageId?: unknown;
        partId?: unknown;
        delta?: unknown;
      };
      if (
        typeof messageId === "string" &&
        typeof partId === "string" &&
        typeof delta === "string"
      ) {
        return {
          event: obj.event,
          data: {
            threadId: data.threadId as string | undefined,
            messageId,
            partId,
            delta,
            toolName: data.toolName as string | undefined,
            metadata: (typeof data.metadata === "object" &&
            data.metadata !== null
              ? (data.metadata as JsonObject)
              : undefined) as { toolName?: string } | undefined,
          },
          timestamp: obj.timestamp,
          sequenceNumber: obj.sequenceNumber,
          id,
        } as NetworkEvent;
      }
      break;
    }
    case "part.completed": {
      const type = data.type;
      const messageId = data.messageId;
      const partId = data.partId;
      if (
        (type === "text" || type === "tool-call" || type === "tool-output") &&
        typeof messageId === "string" &&
        typeof partId === "string"
      ) {
        return {
          event: obj.event,
          data: {
            threadId: data.threadId as string | undefined,
            messageId,
            partId,
            type,
            finalContent: (data as { finalContent?: unknown }).finalContent,
            toolName: data.toolName as string | undefined,
            metadata: (typeof data.metadata === "object" &&
            data.metadata !== null
              ? (data.metadata as JsonObject)
              : undefined) as { toolName?: string } | undefined,
          },
          timestamp: obj.timestamp,
          sequenceNumber: obj.sequenceNumber,
          id,
        } as NetworkEvent;
      }
      break;
    }
    default:
      break;
  }

  // Fallback: return a generic event when the payload doesn't match a known shape
  return {
    event: obj.event,
    data,
    timestamp: obj.timestamp,
    sequenceNumber: obj.sequenceNumber,
    id,
  } as NetworkEvent;
}

/** Lightweight event filter to avoid cross-thread/user noise at the reducer. */
export function shouldProcessEvent(
  evt: NetworkEvent,
  filter: {
    channelKey?: string | null;
    userId?: string | null;
    threadId?: string | null;
  }
): boolean {
  const data = (evt.data as Record<string, unknown>) || {};
  if (
    filter?.threadId &&
    typeof data.threadId === "string" &&
    data.threadId !== filter.threadId
  )
    return false;
  if (
    filter?.userId &&
    typeof data.userId === "string" &&
    data.userId !== filter.userId
  )
    return false;
  return true;
}
