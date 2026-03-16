-- 1. Expense Approval Workflow Tables
CREATE TABLE public.approval_chains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  name TEXT NOT NULL,
  description TEXT,
  min_amount NUMERIC NOT NULL DEFAULT 0,
  max_amount NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE TABLE public.approval_chain_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_id UUID NOT NULL REFERENCES public.approval_chains(id) ON DELETE CASCADE,
  level_order INTEGER NOT NULL,
  role app_role NOT NULL,
  required_approvers INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(chain_id, level_order)
);
CREATE TABLE public.expense_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  chain_id UUID REFERENCES public.approval_chains(id),
  current_level INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE TABLE public.expense_approval_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_approval_id UUID NOT NULL REFERENCES public.expense_approvals(id) ON DELETE CASCADE,
  level_order INTEGER NOT NULL,
  action TEXT NOT NULL,
  approved_by UUID NOT NULL,
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- 2. Anomaly Resolution Workflow Table
CREATE TABLE public.anomaly_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  company_id UUID REFERENCES public.companies(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- 3. Anomaly Detection Settings Table
CREATE TABLE public.anomaly_detection_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) UNIQUE,
  high_amount_threshold_percent NUMERIC NOT NULL DEFAULT 200,
  duplicate_window_hours INTEGER NOT NULL DEFAULT 24,
  rapid_succession_minutes INTEGER NOT NULL DEFAULT 30,
  approval_threshold_percent NUMERIC NOT NULL DEFAULT 90,
  round_amount_threshold NUMERIC NOT NULL DEFAULT 100,
  weekend_detection_enabled BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- Enable RLS on all tables
ALTER TABLE public.approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_chain_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_detection_settings ENABLE ROW LEVEL SECURITY;
-- RLS Policies for approval_chains
CREATE POLICY "Finance users can manage approval chains" ON public.approval_chains
  FOR ALL USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view active approval chains" ON public.approval_chains
  FOR SELECT USING ((company_id = get_user_company_id(auth.uid()) OR is_admin(auth.uid())) AND is_active = true);
-- RLS Policies for approval_chain_levels
CREATE POLICY "Finance users can manage chain levels" ON public.approval_chain_levels
  FOR ALL USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view chain levels" ON public.approval_chain_levels
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM approval_chains WHERE id = chain_id AND (company_id = get_user_company_id(auth.uid()) OR is_admin(auth.uid()))
  ));
-- RLS Policies for expense_approvals
CREATE POLICY "Finance users can manage expense approvals" ON public.expense_approvals
  FOR ALL USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view their expense approvals" ON public.expense_approvals
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM expenses WHERE id = expense_id AND (created_by = auth.uid() OR has_finance_access(auth.uid()) OR is_admin(auth.uid()))
  ));
-- RLS Policies for expense_approval_actions
CREATE POLICY "Finance users can manage approval actions" ON public.expense_approval_actions
  FOR ALL USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view approval actions on their expenses" ON public.expense_approval_actions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM expense_approvals ea 
    JOIN expenses e ON ea.expense_id = e.id 
    WHERE ea.id = expense_approval_id AND (e.created_by = auth.uid() OR has_finance_access(auth.uid()) OR is_admin(auth.uid()))
  ));
-- RLS Policies for anomaly_reviews
CREATE POLICY "Finance users can manage anomaly reviews" ON public.anomaly_reviews
  FOR ALL USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view their expense anomaly reviews" ON public.anomaly_reviews
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM expenses WHERE id = expense_id AND (created_by = auth.uid() OR has_finance_access(auth.uid()) OR is_admin(auth.uid()))
  ));
-- RLS Policies for anomaly_detection_settings
CREATE POLICY "Finance users can manage anomaly settings" ON public.anomaly_detection_settings
  FOR ALL USING (has_finance_access(auth.uid()));
CREATE POLICY "Users can view anomaly settings" ON public.anomaly_detection_settings
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_admin(auth.uid()));
-- Create triggers for updated_at
CREATE TRIGGER update_approval_chains_updated_at BEFORE UPDATE ON public.approval_chains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expense_approvals_updated_at BEFORE UPDATE ON public.expense_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_anomaly_reviews_updated_at BEFORE UPDATE ON public.anomaly_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_anomaly_detection_settings_updated_at BEFORE UPDATE ON public.anomaly_detection_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
