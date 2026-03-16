-- Create notifications table to track all sent emails and system notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  user_id UUID, -- The user this notification is about (recipient)
  type TEXT NOT NULL, -- 'email', 'reminder', 'system'
  category TEXT NOT NULL, -- 'invoice', 'expense', 'payment_reminder', 'receipt', etc.
  title TEXT NOT NULL,
  message TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'pending'
  metadata JSONB DEFAULT '{}', -- Additional data like invoice_id, expense_id, etc.
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID -- The user who triggered the notification
);
-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
-- Create policies
CREATE POLICY "Finance and admins can view all notifications"
ON public.notifications
FOR SELECT
USING (has_finance_access(auth.uid()) OR is_admin(auth.uid()));
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
-- Create index for faster lookups
CREATE INDEX idx_notifications_company_id ON public.notifications(company_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_category ON public.notifications(category);
-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
