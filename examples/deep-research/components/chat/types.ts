import { Message } from "@inngest/agent-kit";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatUpdate {
  type: "chat";
  eventType: "message" | "complete" | "error";
  message?: Message;
  timestamp: string;
  agent?: string | null;
  isLoading?: boolean;
}
