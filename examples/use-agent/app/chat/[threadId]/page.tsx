import { Chat } from "@/components/chat/Chat";
import { AgentProvider } from "@/contexts/AgentContext";

interface ThreadPageProps {
  params: Promise<{
    threadId: string;
  }>;
}

export default async function ThreadPage({ params }: ThreadPageProps) {
  const { threadId } = await params;
  
  return (
    <AgentProvider userId="dev-user-123" debug={true}>
      <Chat threadId={threadId} />
    </AgentProvider>
  );
}

