import { createAgent, createTool, openai } from "@inngest/agent-kit";
import { z } from "zod";
import type { CustomerSupportState } from "../types/state";

// Mock billing tools
const checkSubscriptionTool = createTool({
  name: "check_subscription",
  description: "Check the current subscription status for a customer",
  parameters: z.object({
    customerId: z.string().describe("The customer ID to check subscription for"),
  }),
  handler: async ({ customerId }) => {
    // Mock implementation
    return {
      customerId,
      plan: "Professional",
      status: "active",
      nextBillingDate: "2024-02-01",
      amount: "$99/month",
    };
  },
});

const processRefundTool = createTool({
  name: "process_refund",
  description: "Process a refund request for a customer",
  parameters: z.object({
    customerId: z.string(),
    amount: z.number().describe("Amount to refund in dollars"),
    reason: z.string().describe("Reason for the refund"),
  }),
  handler: async ({ customerId, amount, reason }) => {
    // Mock implementation
    return {
      refundId: `ref_${Date.now()}`,
      customerId,
      amount,
      reason,
      status: "pending_approval",
      message: "Refund request has been submitted for approval",
    };
  },
});

const getInvoiceHistoryTool = createTool({
  name: "get_invoice_history",
  description: "Get invoice history for a customer",
  parameters: z.object({
    customerId: z.string(),
    limit: z.number().optional(),
  }),
  handler: async ({ customerId, limit = 5 }) => {
    // Mock implementation
    return {
      customerId,
      invoices: [
        { id: "inv_001", date: "2024-01-01", amount: "$99.00", status: "paid" },
        { id: "inv_002", date: "2023-12-01", amount: "$99.00", status: "paid" },
        { id: "inv_003", date: "2023-11-01", amount: "$99.00", status: "paid" },
      ].slice(0, limit),
    };
  },
});

export const billingAgent = createAgent<CustomerSupportState>({
  name: "Billing Support",
  description: "Handles billing, payment, subscription, and invoice-related inquiries",
  system: `You are a billing support specialist. You help customers with:
- Subscription management and upgrades/downgrades
- Payment issues and failed transactions
- Refund requests
- Invoice questions
- Billing cycle information

Be helpful, accurate with financial information, and empathetic when dealing with payment issues.
Always confirm customer details before making any changes.`,
  model: openai({ 
    model: "gpt-4o-mini",
    defaultParameters: {
      temperature: 0.2
    }
  }),
  tools: [checkSubscriptionTool, processRefundTool, getInvoiceHistoryTool],
}); 