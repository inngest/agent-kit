"use client";

import { useMemo, useState, useEffect } from "react";
import { createInMemorySessionTransport } from "@inngest/use-agents";
import { useInsightsAgent, type ClientState } from "@/lib/use-insights-agent";

export default function SimpleChatPage() {

  return (
    <div style={{ maxWidth: 740, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
        use-agents: Simple Chat (Ephemeral)
      </h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        This demo uses in-memory transport with no thread management or
        persistence. Send a message, see streaming output and render tool calls
        generatively.
      </p>
      <Chat />
    </div>
  );
}

function Chat() {
  const [input, setInput] = useState("");
  const { messages, status, sendMessage } = useInsightsAgent({
    channelKey: "simple_chat",
    debug: false,
    state: (): ClientState => ({
      eventTypes: [
        "app/user.created",
        "order.created",
        "payment.failed",
        "email.sent",
      ],
      schemas: null,
      currentQuery: "",
      tabTitle: "Simple Chat",
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
    <div className="flex flex-col gap-3">
      <div>
        {messages.map(({ id, role, parts }) => (
          <div key={id}>
            <p className="text-xs">{role}</p>
            {parts.map((part) => {
              if (part.type === "text") {
                return (
                  <div key={part.id}>
                    {part.content}
                  </div>
                );
              }
              if (part.type === "tool-call") {
                if (part.state === "output-available") {
                  switch (part.toolName) {
                    case "select_events":
                      return (
                        <SelectedEventsCard
                          key={part.toolCallId}
                          data={part.output.data}
                        />
                      );
                    case "generate_sql":
                      return (
                        <SqlResultCard
                          key={part.toolCallId}
                          data={part.output.data}
                        />
                      );
                  }
                }
                return (
                  <ToolLoadingIndicator
                    key={part.toolCallId}
                    toolName={part.toolName}
                  />
                );
              }
              return null;
            })}
          </div>
        ))}

        {status === "streaming" &&
          !messages.some(({ parts }) =>
            parts.some(
              (p) => p.type === "tool-call" && p.state !== "output-available"
            )
          ) && (
            <div className="text-xs text-gray-500">Thinking…</div>
          )}
        {status === "streaming" &&
          !messages.some(({ parts }) =>
            parts.some(
              (p) => p.type === "tool-call" && p.state !== "output-available"
            )
          ) && (
            <div className="text-xs text-gray-500">Thinking…</div>
          )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={status === "ready" ? "Ask something…" : "Working…"}
          disabled={status !== "ready"}
          className="flex-1 p-2 border border-gray-300 rounded"
        />
        <button
          type="submit"
          disabled={status !== "ready"}
          className="p-2 rounded border border-gray-300"
        >
          Send
        </button>
      </form>
    </div>
  );
}

// Loading indicator for tools
function ToolLoadingIndicator({ toolName }: { toolName: string }) {
  return (
    <div
      className="bg-gray-50 p-2 rounded border border-gray-300"
    >
      Executing tool: <strong>{toolName}</strong>...
    </div>
  );
}

// Typed renderers for tool outputs
function SelectedEventsCard({
  data,
}: {
  data: {
    selected: { event_name: string; reason: string }[];
    reason?: string;
    totalCandidates?: number;
  };
}) {
  return (
    <div
      className="bg-gray-50 p-2 rounded border border-gray-300"
    >
      <div style={{ fontWeight: 600 }}>🎯 Selected Events</div>
      {Array.isArray(data.selected) && data.selected.length > 0 ? (
        <ul style={{ margin: "6px 0 0 16px" }}>
          {data.selected.map((e, i) => (
            <li key={i}>
              <strong>{e.event_name}</strong> – {e.reason}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ color: "#666", fontSize: 13 }}>No events selected</div>
      )}
      <div style={{ marginTop: 6, color: "#0a0" }}>
        ✅ {Array.isArray(data.selected) ? data.selected.length : 0} selected
        {typeof data.totalCandidates === "number" && (
          <span> of {data.totalCandidates}</span>
        )}
      </div>
    </div>
  );
}

function SqlResultCard({
  data,
}: {
  data: { sql: string; title?: string; reasoning?: string };
}) {
  return (
    <div
      style={{
        background: "#fafafa",
        border: "1px solid #eee",
        borderRadius: 6,
        padding: 8,
      }}
    >
      <div style={{ fontWeight: 600 }}>📊 SQL Proposal</div>
      {data.title && (
        <div style={{ marginTop: 4 }}>
          <strong>{data.title}</strong>
        </div>
      )}
      {data.reasoning && (
        <div style={{ color: "#555", marginTop: 4 }}>{data.reasoning}</div>
      )}
      {data.sql && (
        <pre
          style={{
            marginTop: 8,
            background: "#fff",
            border: "1px solid #eee",
            padding: 8,
            borderRadius: 6,
          }}
        >
          {data.sql}
        </pre>
      )}
    </div>
  );
}


