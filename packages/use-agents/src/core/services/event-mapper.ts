import type { NetworkEvent } from "../../types/index.js";

/**
 * Map an incoming realtime chunk to our NetworkEvent shape.
 * Returns null if the payload is not a valid event-like object.
 */
export function mapToNetworkEvent(input: unknown): NetworkEvent | null {
  if (!input || typeof input !== "object") return null;
  let obj = input as Record<string, unknown>;
  // Unwrap common realtime envelope shapes: { channel, topic, data: { event, ... } }
  if (obj && typeof obj.data === "object" && obj.data !== null) {
    const inner = obj.data as Record<string, unknown>;
    if (typeof inner.event === "string") {
      obj = inner; // unwrap to inner event payload
    }
  }

  if (typeof obj.event !== "string") return null;
  if (typeof obj.timestamp !== "number") return null;
  if (typeof obj.sequenceNumber !== "number") return null;
  // data can be any record; ensure object
  const data =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : {};
  const id =
    typeof obj.id === "string" ? obj.id : `${obj.event}:${obj.sequenceNumber}`;
  return {
    event: obj.event,
    data,
    timestamp: obj.timestamp,
    sequenceNumber: obj.sequenceNumber,
    id,
  };
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
  const data = (evt as any).data || {};
  if (filter?.threadId && data.threadId && data.threadId !== filter.threadId)
    return false;
  if (filter?.userId && data.userId && data.userId !== filter.userId)
    return false;
  return true;
}
