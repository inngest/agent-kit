import type { StreamingAction, StreamingState } from "../../types/index.js";
import type { IConnection, IConnectionSubscription } from "../ports/connection.js";
import { reduceStreamingState } from "./streaming-reducer.js";

/**
 * Minimal, framework-agnostic streaming engine.
 * - Holds state
 * - Applies pure reducer on dispatch
 * - Provides optional connection subscribe wiring (no-op ready)
 */
export class StreamingEngine {
  private state: StreamingState;
  private readonly reducer: (
    state: StreamingState,
    action: StreamingAction,
    debug?: boolean
  ) => StreamingState;
  private readonly debug: boolean;
  private activeSub?: IConnectionSubscription;

  constructor(params: {
    initialState: StreamingState;
    reducer?: (s: StreamingState, a: StreamingAction, debug?: boolean) => StreamingState;
    debug?: boolean;
  }) {
    this.state = params.initialState;
    this.reducer = params.reducer ?? reduceStreamingState;
    this.debug = params.debug ?? false;
  }

  getState(): StreamingState {
    return this.state;
  }

  dispatch(action: StreamingAction): void {
    const next = this.reducer(this.state, action, this.debug);
    this.state = next;
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
  handleRealtimeMessages(messages: any[]): void {
    this.dispatch({ type: "REALTIME_MESSAGES_RECEIVED", messages } as StreamingAction);
  }

  /**
   * Clean up active subscription if any.
   */
  teardown(): void {
    try {
      this.activeSub?.unsubscribe();
    } catch {}
    this.activeSub = undefined;
  }
}


