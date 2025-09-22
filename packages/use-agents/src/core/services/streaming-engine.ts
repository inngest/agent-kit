import type {
  StreamingAction,
  StreamingState,
  NetworkEvent,
  ToolManifest,
} from "../../types/index.js";
import type {
  IConnection,
  IConnectionSubscription,
} from "../ports/connection.js";
import { reduceStreamingState } from "./streaming-reducer.js";

/**
 * Minimal, framework-agnostic streaming engine.
 * - Holds state
 * - Applies pure reducer on dispatch
 * - Provides optional connection subscribe wiring (no-op ready)
 */
export class StreamingEngine<
  TManifest extends ToolManifest = ToolManifest,
  TState = Record<string, unknown>,
> {
  private state: StreamingState<TManifest, TState>;
  private readonly reducer: (
    state: StreamingState<TManifest, TState>,
    action: StreamingAction<TManifest, TState>,
    debug?: boolean
  ) => StreamingState<TManifest, TState>;
  private readonly debug: boolean;
  private activeSub?: IConnectionSubscription;
  private listeners: Set<() => void> = new Set();

  constructor(params: {
    initialState: StreamingState<TManifest, TState>;
    reducer?: (
      s: StreamingState<TManifest, TState>,
      a: StreamingAction<TManifest, TState>,
      debug?: boolean
    ) => StreamingState<TManifest, TState>;
    debug?: boolean;
  }) {
    this.state = params.initialState;
    this.reducer = params.reducer ?? reduceStreamingState;
    this.debug = params.debug ?? false;
  }

  getState(): StreamingState<TManifest, TState> {
    return this.state;
  }

  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        // ignore listener errors
      }
    }
  }

  dispatch(action: StreamingAction<TManifest, TState>): void {
    const prev = this.state;
    const next = this.reducer(this.state, action, this.debug);
    this.state = next;
    if (next !== prev) {
      this.notify();
    }
  }

  /**
   * Wire up a connection subscription. Returns a disposable.
   * This is a seam; actual message/event mapping is delegated to callers today.
   */
  async subscribeWithConnection(
    conn: IConnection,
    params: {
      channel: string;
      onMessage: (chunk: unknown) => void;
      onStateChange?: (state: unknown) => void;
    }
  ): Promise<IConnectionSubscription> {
    this.teardown();
    const sub = await conn.subscribe({
      channel: params.channel,
      onMessage: params.onMessage,
      onStateChange: params.onStateChange,
      debug: this.debug,
    });
    this.activeSub = sub;
    return sub;
  }

  /**
   * Handle a batch of realtime messages (already filtered/mapped by caller).
   */
  handleRealtimeMessages(messages: NetworkEvent[]): void {
    this.dispatch({
      type: "REALTIME_MESSAGES_RECEIVED",
      messages,
    });
  }

  /**
   * Clean up active subscription if any.
   */
  teardown(): void {
    if (this.activeSub) {
      try {
        this.activeSub.unsubscribe();
      } catch {
        // ignore
      }
    }
    this.activeSub = undefined;
  }
}
