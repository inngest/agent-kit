import type { IConnection, IConnectionSubscription, IConnectionTokenProvider } from "../ports/connection.js";

/**
 * Minimal, framework-agnostic connection manager.
 * Delegates to an injected IConnection adapter. No runtime logic yet.
 */
export class ConnectionManager {
  private readonly connection: IConnection;
  private readonly tokenProvider?: IConnectionTokenProvider;
  private unsubscribe?: () => void;
  private readonly debug: boolean;

  constructor(params: { connection: IConnection; tokenProvider?: IConnectionTokenProvider; debug?: boolean }) {
    this.connection = params.connection;
    this.tokenProvider = params.tokenProvider;
    this.debug = Boolean(params.debug);
  }

  async start(params: {
    channel: string;
    onMessage: (chunk: unknown) => void;
    onStateChange?: (state: unknown) => void;
    userId?: string;
    threadId?: string;
  }): Promise<void> {
    const sub = await this.connection.subscribe({
      channel: params.channel,
      onMessage: params.onMessage,
      onStateChange: params.onStateChange ?? (() => {}),
      debug: this.debug,
    });
    this.unsubscribe = sub.unsubscribe;
  }

  stop(): void {
    try {
      this.unsubscribe?.();
    } finally {
      this.unsubscribe = undefined;
    }
  }
}


