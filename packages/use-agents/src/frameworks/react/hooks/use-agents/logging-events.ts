/**
 * Lightweight event names used for internal debug logging within useAgents.
 * These are not public events; they are used purely for structured logs.
 */
export const AgentsEvents = {
  Init: "agents.init",
  Mount: "agents.mount",
  Unmount: "agents.unmount",
  StatusChanged: "agents.status.changed",
  ConnectionChanged: "agents.connection.changed",
  CurrentThreadChanged: "agents.thread.changed",
  MessagesChanged: "agents.messages.changed",

  // History/rehydration telemetry
  HistoryFetchStart: "agents.history.fetch.start",
  HistoryFetchEnd: "agents.history.fetch.end",
  HistoryFetchEmpty: "agents.history.fetch.empty",
  HistoryRetryStart: "agents.history.retry.start",
  HistoryRetryEnd: "agents.history.retry.end",
  HydrateSessionStart: "agents.hydrate.session.start",
  HydrateSessionEnd: "agents.hydrate.session.end",
  EngineReplaceMessages: "agents.engine.thread.replace",
  SelectorReadMessages: "agents.selector.read.messages",
  UIEmptyRendered: "agents.ui.empty",
  ProviderIdentityResolved: "agents.provider.identity.resolved",
  DevFastRefreshBegin: "agents.dev.fastRefresh.begin",
  DevFastRefreshEnd: "agents.dev.fastRefresh.end",

  SendMessage: "agents.action.sendMessage",
  SendMessageToThread: "agents.action.sendMessageToThread",
  Cancel: "agents.action.cancel",
  ApproveTool: "agents.action.approveToolCall",
  DenyTool: "agents.action.denyToolCall",
  SwitchThread: "agents.action.switchToThread",
  SetCurrentThread: "agents.action.setCurrentThreadId",
  LoadThreadHistory: "agents.action.loadThreadHistory",
  ClearThreadMessages: "agents.action.clearThreadMessages",
  ReplaceThreadMessages: "agents.action.replaceThreadMessages",
  CreateNewThread: "agents.action.createNewThread",
  DeleteThread: "agents.action.deleteThread",
  LoadMoreThreads: "agents.action.loadMoreThreads",
  RefreshThreads: "agents.action.refreshThreads",
  RehydrateState: "agents.action.rehydrateMessageState",
} as const;

export type AgentsEventName = typeof AgentsEvents[keyof typeof AgentsEvents];


