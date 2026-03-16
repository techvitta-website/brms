-- Add resolution_notes column to expense_policy_violations
ALTER TABLE public.expense_policy_violations
ADD COLUMN resolution_notes TEXT;
