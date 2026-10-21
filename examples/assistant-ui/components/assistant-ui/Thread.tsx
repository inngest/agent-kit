import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  ThreadPrimitive,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { ArrowDown, ArrowUp, Package, Plus } from "lucide-react";

export function ThreadList() {
  return (
    <ThreadListPrimitive.Root className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-3 md:w-64 md:flex-col md:border-r md:border-b-0">
      <ThreadListPrimitive.New className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100">
        <Plus size={16} /> New chat
      </ThreadListPrimitive.New>
      <ThreadListPrimitive.Items>
        {() => (
          <ThreadListItemPrimitive.Root className="max-w-48 shrink-0 rounded-lg text-sm text-slate-700 hover:bg-slate-200 md:max-w-none data-active:bg-slate-200 data-active:font-medium">
            <ThreadListItemPrimitive.Trigger className="w-full truncate px-3 py-2 text-left">
              <ThreadListItemPrimitive.Title fallback="New chat" />
            </ThreadListItemPrimitive.Trigger>
          </ThreadListItemPrimitive.Root>
        )}
      </ThreadListPrimitive.Items>
    </ThreadListPrimitive.Root>
  );
}

export function Thread({ error }: { error?: string }) {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-6">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <div className="my-auto space-y-3 py-12 text-center">
              <h2 className="text-2xl font-semibold text-slate-900">
                AgentKit + assistant-ui
              </h2>
              <p className="text-slate-500">
                A support agent running in Inngest that looks up orders.
              </p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <ThreadPrimitive.Suggestion
                  prompt="Where is order 1002?"
                  send
                  className="rounded-xl border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Where is order 1002?
                </ThreadPrimitive.Suggestion>
                <ThreadPrimitive.Suggestion
                  prompt="Has order 1001 been delivered?"
                  send
                  className="rounded-xl border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Has order 1001 been delivered?
                </ThreadPrimitive.Suggestion>
              </div>
            </div>
          </AuiIf>
          <ThreadPrimitive.Messages>
            {({ message }) =>
              message.role === "user" ? <UserMessage /> : <AssistantMessage />
            }
          </ThreadPrimitive.Messages>
        </div>
        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto mt-6 w-full max-w-3xl bg-white pb-4 pt-2">
          <ThreadPrimitive.ScrollToBottom
            aria-label="Scroll to latest message"
            className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full border bg-white p-2 shadow-sm disabled:invisible"
          >
            <ArrowDown size={16} />
          </ThreadPrimitive.ScrollToBottom>
          {error && (
            <p role="alert" className="mb-2 text-sm text-red-700">
              The agent run failed: {error}
            </p>
          )}
          <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-3 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500">
            <ComposerPrimitive.Input
              autoFocus
              aria-label="Message"
              placeholder="Ask about an order…"
              rows={1}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none"
            />
            <ComposerPrimitive.Send
              aria-label="Send message"
              className="rounded-xl bg-indigo-600 p-3 text-white disabled:opacity-40"
            >
              <ArrowUp size={18} />
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-4 py-3">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="w-full space-y-3">
      <div className="prose prose-slate max-w-none break-words">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { by_name: { get_order: OrderCard } },
          }}
        />
      </div>
      <AuiIf
        condition={(s) =>
          s.message.isLast && s.message.status?.type === "running"
        }
      >
        <p role="status" className="text-sm text-slate-500">
          Working…
        </p>
      </AuiIf>
    </MessagePrimitive.Root>
  );
}

function MarkdownText() {
  return <MarkdownTextPrimitive />;
}

type Order = {
  orderId: string;
  item: string;
  total: number;
  status: string;
  placedAt: string;
};

function OrderCard({ args, result }: ToolCallMessagePartProps) {
  const order = result as Order | { error: string } | undefined;
  return (
    <div className="not-prose flex items-center gap-3 rounded-xl border border-slate-200 p-4">
      <Package className="text-indigo-600" size={28} />
      {order === undefined ? (
        <p className="text-sm text-slate-500">
          Looking up order {String(args.orderId ?? "")}…
        </p>
      ) : "error" in order ? (
        <p className="text-sm text-red-700">{order.error}</p>
      ) : (
        <div className="text-sm">
          <p className="font-medium text-slate-900">
            Order {order.orderId} · {order.item}
          </p>
          <p className="text-slate-500">
            ${order.total} · placed {order.placedAt} ·{" "}
            <span className="font-medium capitalize text-slate-700">
              {order.status}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
