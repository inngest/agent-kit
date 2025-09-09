import type {
    StreamingAction,
    StreamingState,
    ThreadState,
    ConversationMessage,
    TextUIPart,
    ToolCallUIPart,
  } from "../../types/index.js";
  
  // Minimal pure reducer wrapper – delegates to current logic via a simple switch
  // We start with no-op transitions to establish the hexagonal seam without behavior changes.
  
  export function reduceStreamingState(
    state: StreamingState,
    action: StreamingAction,
    _debug: boolean = false
  ): StreamingState {
    switch (action.type) {
      case 'CONNECTION_STATE_CHANGED': {
        // Treat known values from the realtime hook (e.g. 'active', 'connecting', numbers) robustly
        const raw = (action as any).state;
        const text = String(raw).toLowerCase();
        const isConnected = text === 'active' || text === 'open' || text === 'connected' || text === 'ready' || raw === 1;
        return { ...state, isConnected };
      }
  
      case 'SET_CURRENT_THREAD': {
        if (!action.threadId || action.threadId === state.currentThreadId) return state;
        return {
          ...state,
          currentThreadId: action.threadId,
        };
      }
  
      case 'REALTIME_MESSAGES_RECEIVED': {
        if (!Array.isArray(action.messages) || action.messages.length === 0) return state;
        let next: StreamingState = state;
        for (const evt of action.messages as unknown as Array<{ event?: string; data?: any }>) {
          const eventName = typeof evt?.event === 'string' ? evt.event : undefined;
          const data = (evt && typeof evt === 'object' && 'data' in evt) ? (evt as any).data : undefined;
          const threadId = (data && typeof data.threadId === 'string') ? data.threadId : next.currentThreadId;
          if (!threadId) continue;
  
          const thread = ensureThread(next, threadId);
  
          switch (eventName) {
            case 'run.started': {
              const updated: ThreadState = {
                ...thread,
                agentStatus: 'thinking',
                currentAgent: data?.name || thread.currentAgent,
                lastActivity: new Date(),
              };
              next = writeThread(next, threadId, updated);
              break;
            }
            case 'part.created': {
              const updated = applyPartCreated(thread, data);
              next = writeThread(next, threadId, updated);
              break;
            }
            case 'text.delta': {
              const updated = applyTextDelta(thread, data);
              next = writeThread(next, threadId, updated);
              break;
            }
            case 'tool_call.arguments.delta': {
              const updated = applyToolArgumentsDelta(thread, data);
              next = writeThread(next, threadId, updated);
              break;
            }
            case 'tool_call.output.delta': {
              const updated = applyToolOutputDelta(thread, data);
              next = writeThread(next, threadId, updated);
              break;
            }
            case 'part.completed': {
              const updated = applyPartCompleted(thread, data);
              next = writeThread(next, threadId, updated);
              break;
            }
            case 'stream.ended':
            case 'run.completed': {
              const updated: ThreadState = {
                ...thread,
                agentStatus: 'idle',
                lastActivity: new Date(),
              };
              next = writeThread(next, threadId, updated);
              break;
            }
            default:
              break;
          }
        }
        return next;
      }
  
      // Optimistic user message added before send
      case 'MESSAGE_SENT': {
        const threadId = (action as any).threadId as string;
        const messageId = (action as any).messageId as string;
        const message = (action as any).message as string;
        const clientState = (action as any).clientState as Record<string, unknown> | undefined;
        if (!threadId || !messageId || typeof message !== 'string') return state;
  
        const existing = state.threads[threadId]?.messages || [];
        const already = existing.some((m) => m.id === messageId);
        if (already) return state;
  
        const userMessage: ConversationMessage = {
          id: messageId,
          role: 'user',
          parts: [
            { type: 'text', id: `text-${messageId}`, content: message, status: 'complete' } as TextUIPart,
          ],
          timestamp: new Date(),
          status: 'sending',
          clientState,
        } as ConversationMessage;
  
        const base = ensureThread(state, threadId);
        const updated: ThreadState = {
          ...base,
          messages: [...existing, userMessage],
          agentStatus: 'thinking',
          lastActivity: new Date(),
        } as ThreadState;
        return writeThread(state, threadId, updated);
      }
  
      case 'MESSAGE_SEND_SUCCESS': {
        const threadId = (action as any).threadId as string;
        const messageId = (action as any).messageId as string;
        if (!threadId || !messageId) return state;
        const thread = ensureThread(state, threadId);
        const updated: ThreadState = {
          ...thread,
          messages: (thread.messages || []).map((m) =>
            m.id === messageId ? ({ ...m, status: 'sent' } as ConversationMessage) : m
          ),
        } as ThreadState;
        return writeThread(state, threadId, updated);
      }
  
      case 'MESSAGE_SEND_FAILED': {
        const threadId = (action as any).threadId as string;
        const messageId = (action as any).messageId as string;
        const error = (action as any).error as string | undefined;
        if (!threadId || !messageId) return state;
        const thread = ensureThread(state, threadId);
        const updated: ThreadState = {
          ...thread,
          messages: (thread.messages || []).map((m) =>
            m.id === messageId ? ({ ...m, status: 'failed' } as ConversationMessage) : m
          ),
          agentStatus: 'error',
          error: error
            ? { message: error, timestamp: new Date(), recoverable: true }
            : thread.error,
        } as ThreadState;
        return writeThread(state, threadId, updated);
      }
  
      case 'REPLACE_THREAD_MESSAGES': {
        const threadId = (action as any).threadId as string;
        const messages = (action as any).messages as ConversationMessage[];
        if (!threadId || !Array.isArray(messages)) return state;
        const thread = ensureThread(state, threadId);
        const updated: ThreadState = {
          ...thread,
          messages,
          agentStatus: 'idle',
          lastActivity: new Date(),
          error: undefined,
        } as ThreadState;
        return writeThread(state, threadId, updated);
      }
  
      case 'CLEAR_THREAD_MESSAGES': {
        const threadId = (action as any).threadId as string;
        if (!threadId) return state;
        const thread = ensureThread(state, threadId);
        const updated: ThreadState = {
          ...thread,
          messages: [],
          eventBuffer: new Map(),
          nextExpectedSequence: null,
          lastProcessedSequence: 0,
          agentStatus: 'idle',
          error: undefined,
        } as ThreadState;
        return writeThread(state, threadId, updated);
      }
  
      case 'CLEAR_THREAD_ERROR': {
        const threadId = (action as any).threadId as string;
        if (!threadId) return state;
        const thread = ensureThread(state, threadId);
        const updated: ThreadState = { ...thread, error: undefined } as ThreadState;
        return writeThread(state, threadId, updated);
      }
  
      case 'CREATE_THREAD': {
        const threadId = (action as any).threadId as string;
        if (!threadId) return state;
        if (state.threads[threadId]) return state;
        const created = ensureThread(state, threadId);
        return writeThread(state, threadId, created);
      }
  
      case 'REMOVE_THREAD': {
        const threadId = (action as any).threadId as string;
        if (!threadId) return state;
        if (!state.threads[threadId]) return state;
        const { [threadId]: _removed, ...rest } = state.threads as Record<string, ThreadState>;
        return {
          ...state,
          threads: rest,
          currentThreadId:
            state.currentThreadId === threadId ? Object.keys(rest)[0] || '' : state.currentThreadId,
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
      agentStatus: 'idle',
      hasNewMessages: false,
      lastActivity: new Date(),
    } as unknown as ThreadState;
    state.threads[threadId] = created;
    return created;
  }
  
  function writeThread(state: StreamingState, threadId: string, updated: ThreadState): StreamingState {
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
  
  function getOrCreateAssistantMessage(messages: ConversationMessage[], data: any): { list: ConversationMessage[]; msg: ConversationMessage } {
    const messageId: string = data?.messageId || `msg-${Date.now()}`;
    let msg = messages.find((m) => m.id === messageId && m.role === 'assistant');
    if (msg) return { list: messages, msg };
    msg = {
      id: messageId,
      role: 'assistant',
      parts: [],
      timestamp: new Date(),
      status: 'sent',
    } as ConversationMessage;
    return { list: [...messages, msg], msg };
  }
  
  function ensureTextPart(message: ConversationMessage, partId: string): TextUIPart {
    let part = message.parts.find((p) => p.type === 'text' && (p as TextUIPart).id === partId) as TextUIPart | undefined;
    if (!part) {
      part = { type: 'text', id: partId, content: '', status: 'streaming' } as TextUIPart;
      message.parts = [...message.parts, part];
    }
    return part;
  }
  
  function applyPartCreated(thread: ThreadState, data: any): ThreadState {
    if (!data) return thread;
    const type = data?.type as string | undefined;
    const messageId = data?.messageId as string | undefined;
    const partId = data?.partId as string | undefined;
    if (!type || !messageId || !partId) return { ...thread };
    const { list, msg } = getOrCreateAssistantMessage(thread.messages as any, data);
    if (type === 'text') {
      ensureTextPart(msg, partId);
    } else if (type === 'tool-call') {
      const tool: ToolCallUIPart = {
        type: 'tool-call',
        toolCallId: partId,
        toolName: data?.metadata?.toolName || '',
        state: 'input-streaming',
        input: {},
        output: undefined,
      } as ToolCallUIPart;
      msg.parts = [...msg.parts, tool];
    }
    return { ...thread, messages: list, agentStatus: type === 'tool-call' ? 'calling-tool' : 'responding', lastActivity: new Date() };
  }
  
  function applyTextDelta(thread: ThreadState, data: any): ThreadState {
    if (!data) return thread;
    const partId = data?.partId as string | undefined;
    const messageId = data?.messageId as string | undefined;
    const delta = data?.delta as string | undefined;
    if (!partId || !messageId || typeof delta !== 'string') return { ...thread };
    const { list, msg } = getOrCreateAssistantMessage(thread.messages as any, data);
    const part = ensureTextPart(msg, partId);
    part.content = (part.content || '') + delta;
    part.status = 'streaming';
    return { ...thread, messages: list, agentStatus: 'responding', lastActivity: new Date() };
  }
  
  function applyPartCompleted(thread: ThreadState, data: any): ThreadState {
    if (!data) return thread;
    const messageId = data?.messageId as string | undefined;
    const partId = data?.partId as string | undefined;
    const type = data?.type as string | undefined;
    const finalContent = (data as any)?.finalContent;
    if (!messageId || !partId) return { ...thread };
    const { list, msg } = getOrCreateAssistantMessage(thread.messages as any, data);
  
    if (type === 'text') {
      const text = msg.parts.find((p) => p.type === 'text' && (p as TextUIPart).id === partId) as TextUIPart | undefined;
      if (text) text.status = 'complete';
      return { ...thread, messages: list, lastActivity: new Date() };
    }
  
    if (type === 'tool-call') {
      let tool = msg.parts.find((p) => p.type === 'tool-call' && (p as ToolCallUIPart).toolCallId === partId) as ToolCallUIPart | undefined;
      if (!tool) {
        tool = {
          type: 'tool-call',
          toolCallId: partId,
          toolName: data?.toolName || data?.metadata?.toolName || '',
          state: 'input-available',
          input: {},
        } as ToolCallUIPart;
        msg.parts = [...msg.parts, tool];
      }
      // Prefer structured final input if provided
      if (finalContent !== undefined) {
        try {
          tool.input = typeof finalContent === 'string' ? JSON.parse(finalContent) : finalContent;
        } catch {
          tool.input = finalContent;
        }
      }
      tool.state = 'input-available';
      return { ...thread, messages: list, agentStatus: 'calling-tool', lastActivity: new Date() };
    }
  
    if (type === 'tool-output') {
      const tool = msg.parts.find((p) => p.type === 'tool-call' && (p as ToolCallUIPart).toolCallId === partId) as ToolCallUIPart | undefined;
      if (tool) {
        // Finalize output
        tool.output = finalContent !== undefined ? finalContent : tool.output;
        tool.state = 'output-available';
        return { ...thread, messages: list, agentStatus: 'responding', lastActivity: new Date() };
      }
    }
  
    // Fallback: if unknown type, keep thread unchanged except activity
    return { ...thread, messages: list, lastActivity: new Date() };
  }
  
  function applyToolArgumentsDelta(thread: ThreadState, data: any): ThreadState {
    if (!data) return thread;
    const partId = data?.partId as string | undefined;
    const messageId = data?.messageId as string | undefined;
    const delta = data?.delta as string | undefined;
    if (!partId || !messageId || typeof delta !== 'string') return { ...thread };
    const { list, msg } = getOrCreateAssistantMessage(thread.messages as any, data);
    let tool = msg.parts.find((p) => p.type === 'tool-call' && (p as ToolCallUIPart).toolCallId === partId) as ToolCallUIPart | undefined;
    if (!tool) {
      tool = {
        type: 'tool-call',
        toolCallId: partId,
        toolName: data?.toolName || data?.metadata?.toolName || '',
        state: 'input-streaming',
        input: {},
        output: undefined,
      } as ToolCallUIPart;
      msg.parts = [...msg.parts, tool];
    }
    try {
      // Deltas are JSON string chunks; accumulate into object
      const chunk = delta.trim();
      if (!chunk) return { ...thread };
      const parsed = JSON.parse(chunk);
      if (parsed && typeof parsed === 'object') {
        tool.input = { ...(tool.input || {}), ...parsed };
      }
    } catch {
      // If not valid standalone JSON, concatenate into a string buffer
      const prev = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input || {});
      tool.input = prev + delta;
    }
    tool.state = 'input-streaming';
    return { ...thread, messages: list, agentStatus: 'calling-tool', lastActivity: new Date() };
  }
  
  function applyToolOutputDelta(thread: ThreadState, data: any): ThreadState {
    if (!data) return thread;
    const partId = data?.partId as string | undefined;
    const messageId = data?.messageId as string | undefined;
    const delta = data?.delta as string | undefined;
    if (!partId || !messageId || typeof delta !== 'string') return { ...thread };
    const { list, msg } = getOrCreateAssistantMessage(thread.messages as any, data);
    const tool = msg.parts.find((p) => p.type === 'tool-call' && (p as ToolCallUIPart).toolCallId === partId) as ToolCallUIPart | undefined;
    if (!tool) return { ...thread };
    const prev = typeof tool.output === 'string' ? tool.output : (tool.output === undefined ? '' : JSON.stringify(tool.output));
    tool.output = prev + delta;
    tool.state = 'executing';
    return { ...thread, messages: list, agentStatus: 'calling-tool', lastActivity: new Date() };
  }
  
  
  