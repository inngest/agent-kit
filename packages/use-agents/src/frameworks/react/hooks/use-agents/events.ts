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


