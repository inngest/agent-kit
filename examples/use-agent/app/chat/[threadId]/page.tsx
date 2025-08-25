import { Chat } from "@/components/chat/Chat";

interface ThreadPageProps {
  params: {
    threadId: string;
  };
}

export default function ThreadPage({ params }: ThreadPageProps) {
  return <Chat threadId={params.threadId} />;
}

