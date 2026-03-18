import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCompany } from "./useCompany";

export type ExternalExpenseStatus = "pending" | "approved" | "rejected";

export interface ExternalExpense {
  id: string;
  company_id: string | null;
  category_id: string | null;
  employee_id: string | null;
  description: string;
  amount: number | string;
  currency: string | null;
  expense_date: string;
  department: string | null;
  receipt_id: string | null;
  status: ExternalExpenseStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
  expense_categories?: { name: string } | null;
}

interface ExternalExpenseInsert {
  description: string;
  amount: number;
  expense_date: string;
  category_id?: string | null;
  department?: string | null;
  notes?: string | null;
  receipt_id?: string | null;
}

export function useExternalExpenses() {
  const { data: company } = useCompany();

  return useQuery({
    queryKey: ["external-expenses", company?.id],
    queryFn: async () => {
      if (!company?.id) return [] as ExternalExpense[];

      const { data: rows, error } = await (supabase as any)
        .from("external_expenses")
        .select(`
          *,
          expense_categories:category_id(name)
        `)
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const creatorIds = [...new Set((rows || []).map((r: any) => r.created_by).filter(Boolean))] as string[];
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};

      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", creatorIds as string[]);

        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => {
            acc[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
            return acc;
          }, {} as Record<string, { full_name: string | null; avatar_url: string | null }>);
        }
      }

      return (rows || []).map((expense: any) => ({
        ...expense,
        profiles: expense.created_by ? profilesMap[expense.created_by] || null : null,
      })) as ExternalExpense[];
    },
    enabled: !!company?.id,
  });
}

export function useExternalExpenseStats() {
  const { data: company } = useCompany();

  return useQuery({
    queryKey: ["external-expense-stats", company?.id],
    queryFn: async () => {
      if (!company?.id) {
        return { totalAmount: 0, approvedAmount: 0, pendingAmount: 0, totalTransactions: 0 };
      }

      const { data: expenses, error } = await (supabase as any)
        .from("external_expenses")
        .select("id, amount, status")
        .eq("company_id", company.id);

      if (error) throw error;

      const rows = expenses || [];
      const totalAmount = rows.reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);
      const approvedAmount = rows
        .filter((exp: any) => exp.status === "approved")
        .reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);
      const pendingAmount = rows
        .filter((exp: any) => exp.status === "pending")
        .reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);

      return { totalAmount, approvedAmount, pendingAmount, totalTransactions: rows.length };
    },
    enabled: !!company?.id,
  });
}

export function useCreateExternalExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expense: ExternalExpenseInsert) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();

      const { data, error } = await (supabase as any)
        .from("external_expenses")
        .insert({
          ...expense,
          company_id: profile?.company_id || null,
          created_by: user.id,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      return { expense: data as ExternalExpense };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["external-expense-stats"] });
      toast({
        title: "External expense submitted",
        description: "Your external expense has been submitted for approval",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit external expense",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateExternalExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, expense }: { id: string; expense: Partial<ExternalExpense> }) => {
      const { data, error } = await (supabase as any)
        .from("external_expenses")
        .update(expense)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as ExternalExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["external-expense-stats"] });
      toast({
        title: "External expense updated",
        description: "The external expense has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update external expense",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useApproveExternalExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any)
        .from("external_expenses")
        .update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as ExternalExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["external-expense-stats"] });
      toast({
        title: "External expense approved",
        description: "The external expense has been approved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to approve external expense",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRejectExternalExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any)
        .from("external_expenses")
        .update({
          status: "rejected",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as ExternalExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["external-expense-stats"] });
      toast({
        title: "External expense rejected",
        description: "The external expense has been rejected",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reject external expense",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteExternalExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("external_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["external-expense-stats"] });
      toast({
        title: "External expense deleted",
        description: "The external expense has been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete external expense",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
