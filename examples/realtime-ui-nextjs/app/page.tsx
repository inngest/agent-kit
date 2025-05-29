"use client";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { useCallback, useState } from "react";
import { fetchSubscriptionToken, runDatabaseAgent } from "./actions";
import { databaseAgentChannel } from "@/lib/inngest/functions";
import { Realtime } from "@inngest/realtime";

export default function Home() {
  const [query, setQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [subscriptionToken, setSubscriptionToken] = useState<
    | Realtime.Token<typeof databaseAgentChannel, ["messages", "status"]>
    | undefined
  >(undefined);

  const { data } = useInngestSubscription({
    token: subscriptionToken,
  });

  const startChat = useCallback(async () => {
    setInputValue("");
    const threadId = await runDatabaseAgent(inputValue);
    setThreadId(threadId);
    setQuery(inputValue);
    setSubscriptionToken(await fetchSubscriptionToken(threadId));
  }, [inputValue]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        startChat();
      }
    },
    [startChat]
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#18181b] text-[#e5e5e5]">
      <main className="flex flex-1 flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-2 my-8">
          <h1 className="text-xl font-semibold mb-1">
            Hey there<span className="ml-1">👋</span>
          </h1>
          <p className="text-sm text-[#a1a1aa]">
            Ask me anything about databases design and security best practices.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 w-full max-w-2xl mx-auto px-2">
          {/* User message (question) on the right */}
          {threadId && query && (
            <div className="flex w-full mb-2 justify-end">
              <div className="max-w-[80%] px-4 py-2 rounded-lg text-sm whitespace-pre-line break-words shadow-md bg-[#312e81] text-white rounded-br-none">
                {query}
              </div>
            </div>
          )}
          {/* Agent messages on the left */}
          {data.map((message, idx) =>
            message.topic === "messages" ? (
              <div
                key={`${message.topic}-${message.data.id}`}
                className="flex w-full mb-2 justify-start"
              >
                <div className="max-w-[80%] px-4 py-2 rounded-lg text-sm whitespace-pre-line break-words shadow-md bg-[#232329] text-[#e5e5e5] rounded-bl-none border border-[#232329]">
                  {message.data.message}
                </div>
              </div>
            ) : (
              <div
                key={`status-update-${idx}`}
                className="flex w-full mb-2 justify-start"
              >
                <div className="max-w-[80%] px-4 py-2 rounded-lg text-sm whitespace-pre-line break-words shadow-md bg-[#313136] text-[#e5e5e5] rounded-bl-none border border-[#232329]">
                  {message.data.status === "completed"
                    ? "Here are my recommendations, feel free to ask me anything else!"
                    : message.data.status === "error"
                      ? "I faced an error, please try again."
                      : "Interesting question, I'm thinking..."}
                </div>
              </div>
            )
          )}
        </div>
      </main>
      <footer className="w-full flex flex-col items-center justify-end pb-4">
        <div className="w-full max-w-2xl flex items-end gap-2 px-2">
          <div className="relative flex-1">
            <input
              type="text"
              onKeyDown={onKeyDown}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ex: Provide me a checklist for a database production deployment"
              className="w-full rounded-lg bg-[#232329] border border-[#232329] focus:border-[#52525b] text-[#e5e5e5] px-4 py-2 pr-32 outline-none transition-colors duration-150"
            />
            <button
              onClick={startChat}
              className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 bg-[#312e81] hover:bg-[#4338ca] text-white font-medium px-4 py-1.5 rounded-lg shadow transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:ring-offset-2"
            >
              Run
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
