// Lightweight BroadcastChannel polyfill for tests (JSDOM)
class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  name: string;
  listeners = new Set<(e: MessageEvent) => void>();
  constructor(name: string) {
    this.name = name;
    if (!FakeBroadcastChannel.channels.has(name)) {
      FakeBroadcastChannel.channels.set(name, new Set());
    }
    FakeBroadcastChannel.channels.get(name)!.add(this);
  }
  postMessage(data: unknown) {
    const peers = FakeBroadcastChannel.channels.get(this.name)!;
    for (const peer of peers) {
      if (peer === this) continue;
      peer.listeners.forEach((cb) => cb({ data } as MessageEvent));
    }
  }
  addEventListener(_type: "message", cb: EventListener) {
    this.listeners.add(cb as (e: MessageEvent) => void);
  }
  removeEventListener(_type: "message", cb: EventListener) {
    this.listeners.delete(cb as (e: MessageEvent) => void);
  }
  close() {
    FakeBroadcastChannel.channels.get(this.name)!.delete(this);
  }
}

// Install global if not present
if (!(globalThis as any).BroadcastChannel) {
  (globalThis as any).BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel;
}

export {};


