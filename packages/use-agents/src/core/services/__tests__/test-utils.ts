import type {
  RealtimeEvent,
  MessagePart,
  TextUIPart,
  ToolCallUIPart,
  Thread,
} from "../../../types/index.js";
import type {
  IConnection,
  IConnectionSubscription,
} from "../../ports/connection.js";

export type EventOf<E extends RealtimeEvent["event"]> = Extract<
  RealtimeEvent,
  { event: E }
>;

export function makeEvent<E extends RealtimeEvent["event"]>(
  event: E,
  data: EventOf<E>["data"],
  extras?: Partial<Omit<EventOf<E>, "event" | "data">>
): EventOf<E> {
  const base = {
    event,
    data,
    timestamp: Date.now(),
    sequenceNumber: 1,
    id: `${event}:${Math.random().toString(36).slice(2)}`,
  } satisfies RealtimeEvent;
  return {
    ...base,
    ...(extras || {}),
  } as EventOf<E>;
}

export const isTextPart = (p: MessagePart): p is TextUIPart => p.type === "text";
export const isToolCallPart = (p: MessagePart): p is ToolCallUIPart =>
  p.type === "tool-call";

export function makeConnectionMock(
  subscribeImpl: IConnection["subscribe"]
): IConnection {
  return { subscribe: subscribeImpl } as IConnection;
}

export const makeThread = (id: string, title = "New conversation"): Thread => ({
  id,
  title,
  messageCount: 0,
  lastMessageAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});


