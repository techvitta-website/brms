-- Create expense policies table
CREATE TABLE public.expense_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  name TEXT NOT NULL,
  description TEXT,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('threshold', 'category_restriction', 'daily_limit', 'monthly_limit')),
  threshold_amount NUMERIC,
  category_id UUID REFERENCES public.expense_categories(id),
  action TEXT NOT NULL DEFAULT 'flag' CHECK (action IN ('flag', 'require_approval', 'auto_reject')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);
-- Create expense policy violations table
CREATE TABLE public.expense_policy_violations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.expense_policies(id) ON DELETE CASCADE,
  violation_details TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- Enable RLS
ALTER TABLE public.expense_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_policy_violations ENABLE ROW LEVEL SECURITY;
-- Policies for expense_policies table
CREATE POLICY "Finance users can manage expense policies"
ON public.expense_policies
FOR ALL
USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view active policies"
ON public.expense_policies
FOR SELECT
USING ((company_id = get_user_company_id(auth.uid()) OR is_admin(auth.uid())) AND is_active = true);
-- Policies for expense_policy_violations table
CREATE POLICY "Finance users can view all violations"
ON public.expense_policy_violations
FOR SELECT
USING (has_finance_access(auth.uid()) OR is_admin(auth.uid()));
CREATE POLICY "Finance users can manage violations"
ON public.expense_policy_violations
FOR ALL
USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view their expense violations"
ON public.expense_policy_violations
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.expenses
  WHERE expenses.id = expense_policy_violations.expense_id
  AND expenses.created_by = auth.uid()
));
-- Add trigger for updated_at
CREATE TRIGGER update_expense_policies_updated_at
BEFORE UPDATE ON public.expense_policies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
