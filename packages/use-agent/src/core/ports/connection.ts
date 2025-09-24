// Framework-agnostic connection port for realtime subscriptions

export interface IConnectionTokenProvider {
  getToken(params: {
    userId?: string;
    threadId: string;
    channelKey: string;
  }): Promise<{ token: string; expires?: number }>;
}

export interface IConnectionSubscription {
  unsubscribe(): void;
}

export interface IConnection {
  subscribe(params: {
    channel: string;
    onMessage: (chunk: unknown) => void;
    onStateChange?: (state: unknown) => void;
    debug?: boolean;
  }): Promise<IConnectionSubscription> | IConnectionSubscription;
}
