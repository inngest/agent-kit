import { createAgent, openai } from "@inngest/agent-kit";
import { z } from "zod";
import type { CustomerSupportState } from "../types/state";

export const triageAgent = createAgent<CustomerSupportState>({
  name: "Customer Service Triage",
  description: "Routes customer inquiries to the appropriate specialized agent based on the nature of the request",
  system: `You are a customer service triage specialist. Your job is to understand customer inquiries and route them to the appropriate department.

Available departments:
- Billing: For payment issues, invoices, refunds, subscription changes
- Technical Support: For technical issues, bugs, feature requests, integration help

Analyze the customer's message and determine which department would best handle their request.
Be concise in your analysis.`,
  model: openai({ 
    model: "gpt-4o-mini",
    defaultParameters: {
      temperature: 0.3
    }
  }),
}); 