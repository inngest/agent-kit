import type {
  StreamingAction,
  StreamingState,
  ThreadState,
  ConversationMessage,
  TextUIPart,
  ToolCallUIPart,
  RunStarted,
  PartCreated,
  TextDelta,
  ToolArgsDelta,
  ToolOutputDelta,
  PartCompleted,
} from "../../types/index.js";

// Minimal pure reducer wrapper – delegates to current logic via a simple switch
// We start with no-op transitions to establish the hexagonal seam without behavior changes.

export function reduceStreamingState(
  state: StreamingState,
  action: StreamingAction,
  _debug?: boolean
): StreamingState {
  void _debug;
  switch (action.type) {
    case "CONNECTION_STATE_CHANGED": {
      // Treat known values from the realtime hook (e.g. 'active', 'connecting', numbers) robustly
      const raw = action.state as unknown;
      const text = String(raw).toLowerCase();
      const isConnected =
        text === "active" ||
        text === "open" ||
        text === "connected" ||
        text === "ready" ||
        raw === 1;
      return { ...state, isConnected };
    }

    case "SET_CURRENT_THREAD": {
      if (!action.threadId || action.threadId === state.currentThreadId)
        return state;
      return {
        ...state,
        currentThreadId: action.threadId,
      };
    }

    case "REALTIME_MESSAGES_RECEIVED": {
      if (!Array.isArray(action.messages) || action.messages.length === 0)
        return state;
      let next: StreamingState = state;
      for (const evt of action.messages) {
        const eventName = typeof evt.event === "string" ? evt.event : undefined;
        const data = (evt as { data?: { threadId?: string } }).data;
        const threadId = data?.threadId || next.currentThreadId;
        if (!threadId) continue;

        const thread = ensureThread(next, threadId);

        switch (eventName) {
          case "run.started": {
            const d = (evt as RunStarted).data;
            const updated: ThreadState = {
              ...thread,
              agentStatus: "thinking",
              currentAgent:
                typeof d?.name === "string" ? d.name : thread.currentAgent,
              lastActivity: new Date(),
            };
            next = writeThread(next, threadId, updated);
            break;
          }
          case "part.created": {
            const updated = applyPartCreated(thread, (evt as PartCreated).data);
            next = writeThread(next, threadId, updated);
            break;
          }
          case "text.delta": {
            const updated = applyTextDelta(thread, (evt as TextDelta).data);
            next = writeThread(next, threadId, updated);
            break;
          }
          case "tool_call.arguments.delta": {
            const updated = applyToolArgumentsDelta(
              thread,
              (evt as ToolArgsDelta).data
            );
            next = writeThread(next, threadId, updated);
            break;
          }
          case "tool_call.output.delta": {
            const updated = applyToolOutputDelta(
              thread,
              (evt as ToolOutputDelta).data
            );
            next = writeThread(next, threadId, updated);
            break;
          }
          case "part.completed": {
            const updated = applyPartCompleted(
              thread,
              (evt as PartCompleted).data
            );
            next = writeThread(next, threadId, updated);
            break;
          }
          case "stream.ended":
          case "run.completed": {
            // When a run ends, finalize any in-flight tool calls that already produced output
            const finalized = finalizeToolsWithOutput(thread);
            const updated: ThreadState = {
              ...finalized,
              agentStatus: "idle",
              lastActivity: new Date(),
            } as ThreadState;
            next = writeThread(next, threadId, updated);
            break;
          }
          default:
            break;
        }
        // Mark non-current thread as having unseen messages when updated in background
        try {
          if (threadId !== next.currentThreadId) {
            const t = ensureThread(next, threadId);
            if (!t.hasNewMessages) {
              next = writeThread(next, threadId, {
                ...t,
                hasNewMessages: true,
              } as ThreadState);
            }
          }
        } catch {
          /* noop */
        }
      }
      return next;
    }

    // Optimistic user message added before send
    case "MESSAGE_SENT": {
      const threadId = action.threadId;
      const messageId = action.messageId;
      const message = action.message;
      const clientState = action.clientState;
      if (!threadId || !messageId || typeof message !== "string") return state;

      const existing = state.threads[threadId]?.messages || [];
      const already = existing.some((m) => m.id === messageId);
      if (already) return state;

      const userMessage: ConversationMessage = {
        id: messageId,
        role: "user",
        parts: [
          {
            type: "text",
            id: `text-${messageId}`,
            content: message,
            status: "complete",
          } as TextUIPart,
        ],
        timestamp: new Date(),
        status: "sending",
        clientState,
      } as ConversationMessage;

      const base = ensureThread(state, threadId);
      const updated: ThreadState = {
        ...base,
        messages: [...existing, userMessage],
        agentStatus: "thinking",
        lastActivity: new Date(),
      } as ThreadState;
      return writeThread(state, threadId, updated);
    }

    case "MESSAGE_SEND_SUCCESS": {
      const threadId = action.threadId;
      const messageId = action.messageId;
      if (!threadId || !messageId) return state;
      const thread = ensureThread(state, threadId);
      const updated: ThreadState = {
        ...thread,
        messages: (thread.messages || []).map((m) =>
          m.id === messageId
            ? ({ ...m, status: "sent" } as ConversationMessage)
            : m
        ),
      } as ThreadState;
      return writeThread(state, threadId, updated);
    }

    case "MESSAGE_SEND_FAILED": {
      const threadId = action.threadId;
      const messageId = action.messageId;
      const error = action.error as string | undefined;
      if (!threadId || !messageId) return state;
      const thread = ensureThread(state, threadId);
      const updated: ThreadState = {
        ...thread,
        messages: (thread.messages || []).map((m) =>
          m.id === messageId
            ? ({ ...m, status: "failed" } as ConversationMessage)
            : m
        ),
        agentStatus: "error",
        error: error
          ? { message: error, timestamp: new Date(), recoverable: true }
          : thread.error,
      } as ThreadState;
      return writeThread(state, threadId, updated);
    }

    case "REPLACE_THREAD_MESSAGES": {
      const threadId = action.threadId;
      const messages = action.messages;
      if (!threadId || !Array.isArray(messages)) return state;
      const thread = ensureThread(state, threadId);
      const updated: ThreadState = {
        ...thread,
        messages,
        agentStatus: "idle",
        lastActivity: new Date(),
        error: undefined,
        historyLoaded: true,
      } as ThreadState;
      return writeThread(state, threadId, updated);
    }

    case "CLEAR_THREAD_MESSAGES": {
      const threadId = action.threadId;
      if (!threadId) return state;
      const thread = ensureThread(state, threadId);
      const updated: ThreadState = {
        ...thread,
        messages: [],
        eventBuffer: new Map(),
        nextExpectedSequence: null,
        lastProcessedSequence: 0,
        agentStatus: "idle",
        error: undefined,
      } as ThreadState;
      return writeThread(state, threadId, updated);
    }

    case "CLEAR_THREAD_ERROR": {
      const threadId = action.threadId;
      if (!threadId) return state;
      const thread = ensureThread(state, threadId);
      const updated: ThreadState = {
        ...thread,
        error: undefined,
      } as ThreadState;
      return writeThread(state, threadId, updated);
    }

    case "MARK_THREAD_VIEWED": {
      const threadId = action.threadId;
      if (!threadId) return state;
      const thread = ensureThread(state, threadId);
      if (!thread.hasNewMessages) return state;
      const updated: ThreadState = {
        ...thread,
        hasNewMessages: false,
      } as ThreadState;
      return writeThread(state, threadId, updated);
    }

    case "CREATE_THREAD": {
      const threadId = action.threadId;
      if (!threadId) return state;
      if (state.threads[threadId]) return state;
      const created = ensureThread(state, threadId);
      return writeThread(state, threadId, created);
    }

    case "REMOVE_THREAD": {
      const threadId = action.threadId;
      if (!threadId) return state;
      if (!state.threads[threadId]) return state;
      const rest = { ...state.threads } as Record<string, ThreadState>;
      delete rest[threadId];
      return {
        ...state,
        threads: rest,
        currentThreadId:
          state.currentThreadId === threadId
            ? Object.keys(rest)[0] || ""
            : state.currentThreadId,
      } as StreamingState;
    }

    default:
      return state;
  }
}

function ensureThread(state: StreamingState, threadId: string): ThreadState {
  const existing = state.threads[threadId];
  if (existing) return existing;
  const created: ThreadState = {
    messages: [],
    eventBuffer: new Map(),
    nextExpectedSequence: null,
    lastProcessedSequence: 0,
    agentStatus: "idle",
    hasNewMessages: false,
    lastActivity: new Date(),
    historyLoaded: false,
  } as ThreadState;
  state.threads[threadId] = created;
  return created;
}

function writeThread(
  state: StreamingState,
  threadId: string,
  updated: ThreadState
): StreamingState {
  if (state.threads[threadId] === updated) return state;
  return {
    ...state,
    threads: {
      ...state.threads,
      [threadId]: updated,
    },
  };
}

// === Message assembly helpers (minimal incremental support) ===

function getOrCreateAssistantMessage(
  messages: ConversationMessage[],
  data: { messageId?: string }
): { list: ConversationMessage[]; msg: ConversationMessage } {
  const messageIdRaw = data?.messageId;
  const messageId: string = messageIdRaw || `msg-${Date.now()}`;
  let msg = messages.find((m) => m.id === messageId && m.role === "assistant");
  if (msg) return { list: messages, msg };
  msg = {
    id: messageId,
    role: "assistant",
    parts: [],
    timestamp: new Date(),
    status: "sent",
  } as ConversationMessage;
  return { list: [...messages, msg], msg };
}

function ensureTextPart(
  message: ConversationMessage,
  partId: string
): TextUIPart {
  let part = message.parts.find((p) => p.type === "text" && p.id === partId) as
    | TextUIPart
    | undefined;
  if (!part) {
    part = {
      type: "text",
      id: partId,
      content: "",
      status: "streaming",
    } as TextUIPart;
    message.parts = [...message.parts, part];
  }
  return part;
}

function applyPartCreated(
  thread: ThreadState,
  data: PartCreated["data"]
): ThreadState {
  if (!data) return thread;
  const type = data?.type;
  const messageId = data?.messageId;
  const partId = data?.partId;
  if (!type || !messageId || !partId) return { ...thread };
  const { list, msg } = getOrCreateAssistantMessage(thread.messages, data);
  if (type === "text") {
    ensureTextPart(msg, partId);
  } else if (type === "tool-call") {
    const tool: ToolCallUIPart = {
      type: "tool-call",
      toolCallId: partId,
      toolName: data?.metadata?.toolName || "",
      state: "input-streaming",
      input: {},
      output: undefined,
    } as ToolCallUIPart;
    msg.parts = [...msg.parts, tool];
  }
  return {
    ...thread,
    messages: list,
    agentStatus: type === "tool-call" ? "calling-tool" : "responding",
    lastActivity: new Date(),
  };
}

function applyTextDelta(
  thread: ThreadState,
  data: TextDelta["data"]
): ThreadState {
  if (!data) return thread;
  const partId = data?.partId;
  const messageId = data?.messageId;
  const delta = data?.delta;
  if (!partId || !messageId || typeof delta !== "string") return { ...thread };
  const { list, msg } = getOrCreateAssistantMessage(thread.messages, data);
  const part = ensureTextPart(msg, partId);
  part.content = (part.content || "") + delta;
  part.status = "streaming";
  return {
    ...thread,
    messages: list,
    agentStatus: "responding",
    lastActivity: new Date(),
  };
}

function applyPartCompleted(
  thread: ThreadState,
  data: PartCompleted["data"]
): ThreadState {
  if (!data) return thread;
  const messageId = data?.messageId;
  const partId = data?.partId;
  const type = data?.type;
  const finalContent = data?.finalContent;
  if (!messageId || !partId) return { ...thread };
  const { list, msg } = getOrCreateAssistantMessage(thread.messages, data);

  if (type === "text") {
    const text = msg.parts.find((p) => p.type === "text" && p.id === partId) as
      | TextUIPart
      | undefined;
    if (text) text.status = "complete";
    return { ...thread, messages: list, lastActivity: new Date() };
  }

  if (type === "tool-call") {
    let tool = msg.parts.find(
      (p) => p.type === "tool-call" && p.toolCallId === partId
    ) as ToolCallUIPart | undefined;
    if (!tool) {
      tool = {
        type: "tool-call",
        toolCallId: partId,
        toolName: data?.toolName || data?.metadata?.toolName || "",
        state: "input-available",
        input: {},
      } as ToolCallUIPart;
      msg.parts = [...msg.parts, tool];
    }
    // Prefer structured final input if provided
    if (finalContent !== undefined) {
      try {
        tool.input =
          typeof finalContent === "string"
            ? JSON.parse(finalContent)
            : finalContent;
      } catch {
        tool.input = finalContent;
      }
    }
    tool.state = "input-available";
    return {
      ...thread,
      messages: list,
      agentStatus: "calling-tool",
      lastActivity: new Date(),
    };
  }

  if (type === "tool-output") {
    // Prefer id match; if not, try a reasonable fallback to the latest in-flight tool
    let tool = msg.parts.find(
      (p) => p.type === "tool-call" && p.toolCallId === partId
    ) as ToolCallUIPart | undefined;
    if (!tool) {
      tool = findFallbackToolPartForCompletion(msg);
    }
    if (tool) {
      // Finalize output
      tool.output = finalContent !== undefined ? finalContent : tool.output;
      tool.state = "output-available";
      return {
        ...thread,
        messages: list,
        agentStatus: "responding",
        lastActivity: new Date(),
      };
    }
  }

  // Fallback: if unknown type, keep thread unchanged except activity
  return { ...thread, messages: list, lastActivity: new Date() };
}

function applyToolArgumentsDelta(
  thread: ThreadState,
  data: ToolArgsDelta["data"]
): ThreadState {
  if (!data) return thread;
  const partId = data?.partId;
  const messageId = data?.messageId;
  const delta = data?.delta;
  if (!partId || !messageId || typeof delta !== "string") return { ...thread };
  const { list, msg } = getOrCreateAssistantMessage(thread.messages, data);
  let tool = msg.parts.find(
    (p): p is ToolCallUIPart =>
      p.type === "tool-call" &&
      (p as { toolCallId?: unknown }).toolCallId === partId
  );
  if (!tool) {
    // Fallback: attach to the most recent tool that is awaiting/streaming input
    tool = findFallbackToolPartForArgs(msg);
    if (!tool) {
      tool = {
        type: "tool-call",
        toolCallId: partId,
        toolName: data?.toolName || data?.metadata?.toolName || "",
        state: "input-streaming",
        input: {},
        output: undefined,
      } as ToolCallUIPart;
      msg.parts = [...msg.parts, tool];
    }
  }
  try {
    // Deltas are JSON string chunks; accumulate into object
    const chunk = delta.trim();
    if (!chunk) return { ...thread };
    const parsedUnknown: unknown = JSON.parse(chunk);
    if (
      parsedUnknown &&
      typeof parsedUnknown === "object" &&
      !Array.isArray(parsedUnknown)
    ) {
      const parsedRecord = parsedUnknown as Record<string, unknown>;
      const prevObject: Record<string, unknown> =
        tool.input &&
        typeof tool.input === "object" &&
        !Array.isArray(tool.input)
          ? (tool.input as Record<string, unknown>)
          : {};
      tool.input = { ...prevObject, ...parsedRecord } as unknown;
    }
  } catch {
    // If not valid standalone JSON, concatenate into a string buffer
    const prev =
      typeof tool.input === "string"
        ? tool.input
        : JSON.stringify(tool.input || {});
    tool.input = prev + delta;
  }
  tool.state = "input-streaming";
  return {
    ...thread,
    messages: list,
    agentStatus: "calling-tool",
    lastActivity: new Date(),
  };
}

function applyToolOutputDelta(
  thread: ThreadState,
  data: ToolOutputDelta["data"]
): ThreadState {
  if (!data) return thread;
  const partId = data?.partId;
  const messageId = data?.messageId;
  const delta = data?.delta;
  if (!partId || !messageId || typeof delta !== "string") return { ...thread };
  const { list, msg } = getOrCreateAssistantMessage(thread.messages, data);
  let tool = msg.parts.find(
    (p): p is ToolCallUIPart =>
      p.type === "tool-call" &&
      (p as { toolCallId?: unknown }).toolCallId === partId
  );
  if (!tool) {
    // Fallback: attach to the most recent tool that is executing or has input available
    tool = findFallbackToolPartForOutput(msg);
    if (!tool) return { ...thread };
  }
  const prev =
    typeof tool.output === "string"
      ? tool.output
      : tool.output === undefined
        ? ""
        : JSON.stringify(tool.output as unknown);
  tool.output = prev + delta;
  tool.state = "executing";
  return {
    ...thread,
    messages: list,
    agentStatus: "calling-tool",
    lastActivity: new Date(),
  };
}

// === Helper utilities for robust tool matching ===

function findFallbackToolPartForCompletion(
  message: ConversationMessage
): ToolCallUIPart | undefined {
  // Prefer most recent tool without finalized output
  const tools = message.parts.filter((p) => p.type === "tool-call");
  for (let i = tools.length - 1; i >= 0; i--) {
    const t = tools[i];
    if (t.state !== "output-available") return t;
  }
  return undefined;
}

function findFallbackToolPartForArgs(
  message: ConversationMessage
): ToolCallUIPart | undefined {
  const tools = message.parts.filter((p) => p.type === "tool-call");
  for (let i = tools.length - 1; i >= 0; i--) {
    const t = tools[i];
    if (t.state === "input-streaming" || t.state === "input-available")
      return t;
  }
  return undefined;
}

function findFallbackToolPartForOutput(
  message: ConversationMessage
): ToolCallUIPart | undefined {
  const tools = message.parts.filter((p) => p.type === "tool-call");
  for (let i = tools.length - 1; i >= 0; i--) {
    const t = tools[i];
    if (t.state === "executing" || t.state === "input-available") return t;
  }
  return undefined;
}

function finalizeToolsWithOutput(thread: ThreadState): ThreadState {
  let changed = false;
  const updatedMessages = (thread.messages || []).map((m) => {
    if (m.role !== "assistant") return m;
    const parts = m.parts.map((p) => {
      if (p.type !== "tool-call") return p;
      const tool = p; // narrowed to ToolCallUIPart by discriminant
      if (tool.state === "executing" && tool.output !== undefined) {
        changed = true;
        return { ...tool, state: "output-available" } as ToolCallUIPart;
      }
      return p;
    });
    if (changed) {
      return { ...m, parts } as ConversationMessage;
    }
    return m;
  });
  if (!changed) return thread;
  return { ...thread, messages: updatedMessages } as ThreadState;
}
