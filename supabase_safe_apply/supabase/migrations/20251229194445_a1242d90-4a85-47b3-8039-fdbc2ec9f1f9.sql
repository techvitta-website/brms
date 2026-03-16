-- Create expense delegations table for approval delegation
CREATE TABLE public.expense_delegations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  delegator_id UUID NOT NULL, -- The manager delegating authority
  delegate_id UUID NOT NULL, -- The person receiving authority
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT, -- e.g., "Annual leave", "Business trip"
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date),
  CONSTRAINT different_users CHECK (delegator_id != delegate_id)
);
-- Enable RLS
ALTER TABLE public.expense_delegations ENABLE ROW LEVEL SECURITY;
-- Create policies
CREATE POLICY "Users can view delegations they created or received"
ON public.expense_delegations
FOR SELECT
USING (
  delegator_id = auth.uid() 
  OR delegate_id = auth.uid() 
  OR has_finance_access(auth.uid()) 
  OR is_admin(auth.uid())
);
CREATE POLICY "Finance users can create delegations"
ON public.expense_delegations
FOR INSERT
WITH CHECK (
  has_finance_access(auth.uid()) 
  OR delegator_id = auth.uid()
);
CREATE POLICY "Users can update their own delegations"
ON public.expense_delegations
FOR UPDATE
USING (
  delegator_id = auth.uid() 
  OR has_finance_access(auth.uid()) 
  OR is_admin(auth.uid())
);
CREATE POLICY "Users can delete their own delegations"
ON public.expense_delegations
FOR DELETE
USING (
  delegator_id = auth.uid() 
  OR is_admin(auth.uid())
);
-- Create indexes
CREATE INDEX idx_expense_delegations_delegator ON public.expense_delegations(delegator_id);
CREATE INDEX idx_expense_delegations_delegate ON public.expense_delegations(delegate_id);
CREATE INDEX idx_expense_delegations_dates ON public.expense_delegations(start_date, end_date);
CREATE INDEX idx_expense_delegations_status ON public.expense_delegations(status);
-- Create function to check if user has delegated approval authority
CREATE OR REPLACE FUNCTION public.has_delegated_approval_authority(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_delegations ed
    WHERE ed.delegate_id = _user_id
      AND ed.status = 'active'
      AND CURRENT_DATE BETWEEN ed.start_date AND ed.end_date
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = ed.delegator_id
          AND ur.role IN ('super_admin', 'admin', 'finance_manager', 'accountant')
      )
  )
$$;
-- Add trigger for updated_at
CREATE TRIGGER update_expense_delegations_updated_at
BEFORE UPDATE ON public.expense_delegations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
