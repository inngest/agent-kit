import { Chat } from "@/components/chat/Chat";
import { AgentProvider } from "@/contexts/AgentContext";

export default function Home() {
  return (
    <AgentProvider userId="dev-user-123" debug={true}>
      <Chat />
    </AgentProvider>
  );
}
