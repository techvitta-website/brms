-- Create recurring expenses table
CREATE TABLE public.recurring_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  category_id UUID REFERENCES public.expense_categories(id),
  department TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_due_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_submit BOOLEAN NOT NULL DEFAULT false,
  vendor TEXT,
  notes TEXT,
  last_generated_date DATE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- Enable RLS
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
-- RLS Policies
CREATE POLICY "Users can view their own recurring expenses"
ON public.recurring_expenses
FOR SELECT
USING ((created_by = auth.uid()) OR has_finance_access(auth.uid()) OR is_admin(auth.uid()));
CREATE POLICY "Users can create recurring expenses"
ON public.recurring_expenses
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update their own recurring expenses"
ON public.recurring_expenses
FOR UPDATE
USING ((created_by = auth.uid()) OR has_finance_access(auth.uid()));
CREATE POLICY "Admins can delete recurring expenses"
ON public.recurring_expenses
FOR DELETE
USING (is_admin(auth.uid()));
-- Trigger for updated_at
CREATE TRIGGER update_recurring_expenses_updated_at
BEFORE UPDATE ON public.recurring_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
