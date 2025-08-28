import { Chat } from "@/components/chat/Chat";

interface ThreadPageProps {
  params: Promise<{
    threadId: string;
  }>;
}

export default async function ThreadPage({ params }: ThreadPageProps) {
  const { threadId } = await params;
  return <Chat threadId={threadId} />;
}

