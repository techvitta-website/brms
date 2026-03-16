import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { useCompany } from "./useCompany";
import { dedupeStatementTransactions } from "@/lib/statementTransactionDedup";

export type BankStatement = Tables<"bank_statements">;
export type BankStatementInsert = TablesInsert<"bank_statements">;
export type BankStatementTransaction = Tables<"bank_statement_transactions">;
export type BankStatementTransactionInsert = TablesInsert<"bank_statement_transactions">;

export function useBankStatements() {
  const { data: company } = useCompany();

  return useQuery({
    queryKey: ["bank-statements", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];

      const { data, error } = await supabase
        .from("bank_statements")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as BankStatement[];
    },
    enabled: !!company?.id,
  });
}

export function useBankStatementTransactions(statementId: string | undefined, options?: { dedupe?: boolean }) {
  return useQuery({
    queryKey: ["bank-statement-transactions", statementId, options?.dedupe ? "deduped" : "raw"],
    queryFn: async () => {
      if (!statementId) return [];

      // Don't sort on server side - will be sorted client-side by metadata.transaction_date
      const { data, error } = await supabase
        .from("bank_statement_transactions")
        .select("*")
        .eq("statement_id", statementId);

      if (error) throw error;
      const transactions = data as BankStatementTransaction[];
      return options?.dedupe ? dedupeStatementTransactions(transactions) : transactions;
    },
    enabled: !!statementId,
  });
}

export function useCreateBankStatement() {
  const queryClient = useQueryClient();
  const { data: company } = useCompany();

  return useMutation({
    mutationFn: async ({
      statement,
      transactions,
    }: {
      statement: Omit<BankStatementInsert, "company_id" | "uploaded_by">;
      transactions: Omit<BankStatementTransactionInsert, "statement_id">[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!company?.id) throw new Error("Company not found");

      // Create statement
      const { data: newStatement, error: statementError } = await supabase
        .from("bank_statements")
        .insert({
          ...statement,
          company_id: company.id,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (statementError) throw statementError;
      if (!newStatement) throw new Error("Failed to create statement");

      // Create transactions
      if (transactions.length > 0) {
        const { error: transactionsError } = await supabase
          .from("bank_statement_transactions")
          .insert(
            transactions.map((transaction) => ({
              ...transaction,
              statement_id: newStatement.id,
            }))
          );

        if (transactionsError) throw transactionsError;
      }

      return newStatement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
      toast({
        title: "Statement uploaded",
        description: "Bank statement has been uploaded and processed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to upload statement",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteBankStatement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (statementId: string) => {
      const { error } = await supabase
        .from("bank_statements")
        .delete()
        .eq("id", statementId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
      toast({
        title: "Statement deleted",
        description: "Bank statement has been deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete statement",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateBankStatementTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      transactionId,
      proof,
      category,
      notes,
    }: {
      transactionId: string;
      proof?: string;
      category?: string | null;
      notes?: string | null;
    }) => {
      // Build updates object with only the fields that are provided
      // This ensures we only update the specified fields and leave others intact
      const updates: Partial<{
        proof: string | null;
        category: string | null;
        notes: string | null;
      }> = {};
      
      if (proof !== undefined) {
        updates.proof = proof || null;
      }
      if (category !== undefined) {
        updates.category = category || null;
      }
      if (notes !== undefined) {
        updates.notes = notes || null;
      }

      // Only proceed if there are fields to update
      if (Object.keys(updates).length === 0) {
        return; // No updates to make
      }

      const { error } = await supabase
        .from("bank_statement_transactions")
        .update(updates)
        .eq("id", transactionId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bank-statement-transactions"] });
      if (variables.proof !== undefined) {
        toast({
          title: "Proof updated",
          description: "Transaction proof has been saved successfully",
        });
      } else if (variables.category !== undefined) {
        toast({
          title: "Category updated",
          description: "Transaction category has been saved successfully",
        });
      } else if (variables.notes !== undefined) {
        toast({
          title: "Note updated",
          description: "Transaction note has been saved successfully",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update transaction",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}