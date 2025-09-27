export type ChatState = {
  chatMode: 'support';
  currentSuggestions: string[];
  inputValue: string;
  hoveredMessage: string | null;
  sidebarState: { minimized: boolean; mobileOpen: boolean };
  timestamp: number;
};

// Tool output payload helpers mirror @inngest/use-agent ToolResultPayload shape
export type RefundResult = { refundId: string; userId: string; amount: number; reason: string; status: string; message: string };
export type SubscriptionStatus = { userId: string; plan: string; status: string; nextBillingDate: string; amount: string };
export type InvoiceHistory = { userId: string; invoices: Array<{ id: string; date: string; amount: string; status: string }>; };

export type SystemStatus = { status: string; uptime: string; lastIncident: string };
export type SupportTicket = { ticketId: string; title: string; priority: string; category: string; status: string; estimatedResponse: string; message: string };
export type KnowledgeBaseSearch = { query: string; results?: Array<{ id: string; title: string; excerpt: string; url: string; relevance: number }>; totalResults: number };

// Prefer inferring tools from actual tool definitions via createToolManifest
import { createToolManifest } from "@inngest/agent-kit";
import { billingAgent } from "../inngest/agents/billing";
import { technicalSupportAgent } from "../inngest/agents/technical-support";

// Build a manifest from the agents' tools sets
const customerSupportTools = [
  // access internal maps via agents; we expose tools in arrays here for typing clarity
  ...Array.from(billingAgent.tools.values()),
  ...Array.from(technicalSupportAgent.tools.values()),
] as const;

export const toolManifest = createToolManifest(customerSupportTools);
export type CustomerSupportToolManifest = typeof toolManifest;

export type CustomerSupportAgentConfig = {
  tools: CustomerSupportToolManifest;
  state: ChatState;
};
