"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AgentProvider,
  createInMemorySessionTransport,
} from "@inngest/use-agent";

import { Thread, ThreadList } from "@/components/assistant-ui/Thread";
import { useAgentRuntime } from "@/components/assistant-ui/useAgentRuntime";

// Keeps the thread list in the browser and sends chat and realtime token
// requests to the /api routes in this app.
const transport = createInMemorySessionTransport();

export default function Page() {
  return (
    // A fixed demo user; in a real app this comes from your auth provider.
    <AgentProvider userId="demo-user" transport={transport} debug={false}>
      <Chat />
    </AgentProvider>
  );
}

function Chat() {
  const { runtime, error } = useAgentRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <main className="flex h-dvh flex-col md:flex-row">
        <ThreadList />
        <Thread error={error} />
      </main>
    </AssistantRuntimeProvider>
  );
}
