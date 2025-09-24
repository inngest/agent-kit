import type {
  AgentKitEvent,
  MessagePart,
  TextUIPart,
  ToolCallUIPart,
  Thread,
  ToolManifest,
} from "../../../types/index.js";
import type {
  IConnection,
  IConnectionSubscription,
} from "../../ports/connection.js";

export type EventOf<
  TManifest extends ToolManifest,
  E extends AgentKitEvent<TManifest>["event"],
> = Extract<AgentKitEvent<TManifest>, { event: E }>;

export function makeEvent<
  TManifest extends ToolManifest,
  E extends AgentKitEvent<TManifest>["event"],
>(
  event: E,
  data: EventOf<TManifest, E>["data"],
  extras?: Partial<Omit<EventOf<TManifest, E>, "event" | "data">>
): EventOf<TManifest, E> {
  const base = {
    event,
    data,
    timestamp: Date.now(),
    sequenceNumber: 1,
    id: `${event}:${Math.random().toString(36).slice(2)}`,
  } satisfies AgentKitEvent<ToolManifest>;
  return {
    ...base,
    ...(extras || {}),
  } as EventOf<TManifest, E>;
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


