// State type for the customer support network
export interface CustomerSupportState {
  customerId?: string;
  department?: "billing" | "technical";
  triageComplete?: boolean;
} 