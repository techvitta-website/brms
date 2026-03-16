-- Create department budgets table
CREATE TABLE public.department_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  department TEXT NOT NULL,
  monthly_limit NUMERIC NOT NULL,
  alert_threshold INTEGER NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, department)
);
-- Enable RLS
ALTER TABLE public.department_budgets ENABLE ROW LEVEL SECURITY;
-- RLS Policies
CREATE POLICY "Finance users can manage department budgets"
ON public.department_budgets
FOR ALL
USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view department budgets"
ON public.department_budgets
FOR SELECT
USING ((company_id = get_user_company_id(auth.uid())) OR is_admin(auth.uid()));
-- Trigger for updated_at
CREATE TRIGGER update_department_budgets_updated_at
BEFORE UPDATE ON public.department_budgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
