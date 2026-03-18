-- Create external_expenses table
CREATE TABLE IF NOT EXISTS public.external_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  category_id UUID REFERENCES public.expense_categories(id),
  employee_id UUID REFERENCES public.employees(id),
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  department TEXT,
  receipt_id UUID REFERENCES public.receipts(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.external_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own external expenses"
  ON public.external_expenses FOR SELECT
  USING (
    created_by = auth.uid() OR
    public.has_finance_access(auth.uid()) OR
    public.is_admin(auth.uid())
  );

CREATE POLICY "Users can create external expenses"
  ON public.external_expenses FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can update their pending external expenses"
  ON public.external_expenses FOR UPDATE
  USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can delete external expenses"
  ON public.external_expenses FOR DELETE
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_external_expenses_updated_at
BEFORE UPDATE ON public.external_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
