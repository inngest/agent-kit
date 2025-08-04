import { Chat } from "@/components/chat/Chat";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 max-w-4xl mx-auto w-full p-4">
        <Chat />
      </main>
    </div>
  );
}
