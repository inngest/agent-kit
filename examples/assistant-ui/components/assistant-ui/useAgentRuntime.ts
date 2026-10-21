import {
  MessageNotSentError,
  useExternalStoreRuntime,
  type ExternalStoreThreadData,
} from "@assistant-ui/react";
import { useAgent, type ToolManifest } from "@inngest/use-agent";
import { useState } from "react";

import { convertMessage } from "./convertMessage";

export function useAgentRuntime() {
  const [initialThreadId] = useState(() => crypto.randomUUID());
  // useAgent does not report failed runs, so keep the last error per thread.
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const setError = (id: string, error?: string) =>
    setErrors((prev) => ({ ...prev, [id]: error }));
  const agent = useAgent<ToolManifest, Record<string, unknown>>({
    initialThreadId,
    // Threads live in the browser for this example, so there is no history
    // endpoint to validate against.
    enableThreadValidation: false,
    onEvent: (evt, { threadId }) => {
      if (evt.event === "run.failed" && threadId) {
        setError(threadId, String(evt.data.error));
      }
    },
  });
  const [threads, setThreads] = useState<ExternalStoreThreadData<"regular">[]>(
    []
  );
  const threadId = agent.currentThreadId ?? initialThreadId;

  const runtime = useExternalStoreRuntime({
    // useAgent updates streaming messages in place, so convert on every
    // render instead of handing assistant-ui the same array each time.
    messages: agent.messages.map(convertMessage),
    convertMessage: (message) => message,
    isRunning: agent.status === "submitted" || agent.status === "streaming",
    onNew: async ({ content: [part, ...rest] }) => {
      if (part?.type !== "text" || rest.length) {
        throw new MessageNotSentError("This example accepts text only.");
      }
      if (!threads.some((thread) => thread.id === threadId)) {
        setThreads((prev) => [
          { id: threadId, status: "regular", title: part.text.slice(0, 40) },
          ...prev,
        ]);
      }
      setError(threadId);
      try {
        await agent.sendMessage(part.text);
      } catch (cause) {
        setError(
          threadId,
          cause instanceof Error ? cause.message : String(cause)
        );
      }
    },
    adapters: {
      threadList: {
        threadId,
        threads,
        onSwitchToNewThread: () => {
          agent.createNewThread();
        },
        onSwitchToThread: (id) => agent.switchToThread(id),
      },
    },
  });

  return { runtime, error: errors[threadId] };
}
