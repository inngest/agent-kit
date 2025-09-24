import { Chat } from "@/components/chat/Chat";
import { AgentProvider } from "@inngest/use-agent";

export default function Home() {
  return (
    <AgentProvider userId="dev-user-123" debug={true}>
      <Chat />
    </AgentProvider>
  );
}
