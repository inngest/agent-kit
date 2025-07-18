-- Migration to add the agentkit_approvals table for handling durable tool approvals.

-- Create the approvals table
CREATE TABLE IF NOT EXISTS public.agentkit_approvals (
  approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.agentkit_threads(thread_id) ON DELETE CASCADE,
  wait_for_event_id TEXT NOT NULL UNIQUE,
  tool_calls JSONB[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT,
  
  CONSTRAINT fk_thread
      FOREIGN KEY(thread_id) 
      REFERENCES public.agentkit_threads(thread_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_approvals_thread_id ON public.agentkit_approvals(thread_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON public.agentkit_approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_wait_for_event_id ON public.agentkit_approvals(wait_for_event_id); 