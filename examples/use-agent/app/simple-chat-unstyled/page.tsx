"use client";

import { useState } from "react";
import { useInsightsAgent, type ClientState } from "@/lib/use-insights-agent";
import type { ToolCallUIPart } from "@inngest/use-agent";
import type { ToolManifest } from "@/app/api/inngest/functions/agents/types";

export default function ChatTestPage() {
  return (
    <div>
      <p>Minimal example using a single-threaded conversation.</p>
      <Chat />
    </div>
  );
}

function Chat() {
  const [input, setInput] = useState("");
  const { messages, status, sendMessage } = useInsightsAgent({
    channelKey: "chat_test",
    state: (): ClientState => ({
      eventTypes: [
        "app/user.created",
        "order.created",
        "payment.failed",
        "email.sent",
      ],
      schemas: null,
      currentQuery: "",
      tabTitle: "Chat Test",
      mode: "demo",
      timestamp: Date.now(),
    }),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || status !== "ready") return;
    setInput("");
    await sendMessage(value);
  }

  return (
    <div>
      <div>
        {messages.map(({ id, role, parts }) => (
          <div key={id}>
            <div>{role}</div>
            {parts.map((part) => {
              if (part.type === "text") {
                return <div key={part.id}>{part.content}</div>;
              }
              if (part.type === "tool-call") {
                return <ToolCallRenderer key={part.toolCallId} part={part} />;
              }
              return null;
            })}
          </div>
        ))}

        {status !== "ready" && <p>AI is thinking...</p>}
      </div>

      <form onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={status === "ready" ? "Ask me anything" : "Thinking..."}
          disabled={status !== "ready"}
        />
        <button type="submit" disabled={status !== "ready"}>
          Send
        </button>
      </form>
    </div>
  );
}

function ToolCallRenderer({ part }: { part: ToolCallUIPart<ToolManifest> }) {
  if (part.state !== "output-available") return null;

  if (part.toolName === "select_events") {
    const { data } = part.output;
    return (
      <div>
        <div>Selected Events:</div>
          <ul>
            {data.selected.map((e) => (
              <li key={e.event_name}>
                <p>{e.event_name}</p>
                <p>{e.reason}</p>
              </li>
            ))}
          </ul>
      </div>
    );
  }

  if (part.toolName === "generate_sql") {
    const { data } = part.output;
    return (
      <div>
        <div>SQL Query:</div>
        <p>{data.title}</p>
        <p>{data.reasoning}</p>
        <pre>{data.sql}</pre>
      </div>
    );
  }

  return null;
}
