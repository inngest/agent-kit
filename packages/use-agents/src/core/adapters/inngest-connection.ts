// Framework-agnostic Inngest connection adapter (stub)
// Implements the core connection port with a no-op subscribe for now.
// This establishes the hexagonal seam without changing runtime behavior.
//
// NOTE (2025-09): This is a stub. The plan is to implement a real adapter
// that uses the non-React Inngest Realtime client and is driven via
// ConnectionManager + useSyncExternalStore in React.

import type {
  IConnection,
  IConnectionSubscription,
  IConnectionTokenProvider,
} from "../ports/connection.js";

export class InngestConnection implements IConnection {
  private tokenProvider?: IConnectionTokenProvider;

  constructor(params?: { tokenProvider?: IConnectionTokenProvider }) {
    this.tokenProvider = params?.tokenProvider;
  }

  subscribe(params: {
    channel: string;
    onMessage: (chunk: unknown) => void;
    onStateChange?: (state: unknown) => void;
    debug?: boolean;
  }): IConnectionSubscription {
    // Placeholder implementation – no underlying socket yet.
    // Immediately emit a benign state change to indicate the seam works.
    try {
      params.onStateChange?.({
        status: "stub-connected",
        channel: params.channel,
      });
    } catch {
      // ignore
    }

    // Return a no-op unsubscriber; safe to call multiple times.
    let isActive = true;
    return {
      unsubscribe: () => {
        if (!isActive) return;
        isActive = false;
        try {
          params.onStateChange?.({
            status: "stub-disconnected",
            channel: params.channel,
          });
        } catch {
          // ignore
        }
      },
    };
  }
}

export function createInngestConnection(params?: {
  tokenProvider?: IConnectionTokenProvider;
}): IConnection {
  return new InngestConnection(params);
}
