import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { dedupeStatementTransactions } from "@/lib/statementTransactionDedup";

export interface CategoryStat {
  categoryName: string;
  totalDebit: number;
  totalCredit: number;
  netAmount: number; // credit - debit (positive = net credit, negative = net debit)
  transactionCount: number;
}

export function useCategoryStats() {
  const { data: company } = useCompany();

  return useQuery({
    queryKey: ["category-stats", company?.id],
    queryFn: async (): Promise<CategoryStat[]> => {
      if (!company?.id) return [];

      // First, get all statement IDs for this company
      const { data: statements, error: statementsError } = await supabase
        .from("bank_statements")
        .select("id")
        .eq("company_id", company.id);

      if (statementsError) throw statementsError;
      if (!statements || statements.length === 0) return [];

      const statementIds = statements.map((s) => s.id);

      // Fetch all transactions from all statements for this company
      const { data: transactions, error } = await supabase
        .from("bank_statement_transactions")
        .select("category, debit_amount, credit_amount, transaction_date, value_date, description, transaction_type, metadata")
        .in("statement_id", statementIds)
        .not("category", "is", null);

      if (error) throw error;
      if (!transactions || transactions.length === 0) return [];

      const dedupedTransactions = dedupeStatementTransactions(transactions as any[]);

      // Group by category and calculate totals
      const categoryMap = new Map<string, CategoryStat>();

      dedupedTransactions.forEach((transaction: any) => {
        const categoryName = transaction.category;
        if (!categoryName) return;

        const debitAmount = Number(transaction.debit_amount) || 0;
        const creditAmount = Number(transaction.credit_amount) || 0;

        if (!categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, {
            categoryName,
            totalDebit: 0,
            totalCredit: 0,
            netAmount: 0,
            transactionCount: 0,
          });
        }

        const stat = categoryMap.get(categoryName)!;
        stat.totalDebit += debitAmount;
        stat.totalCredit += creditAmount;
        stat.netAmount = stat.totalCredit - stat.totalDebit;
        stat.transactionCount += 1;
      });

      // Convert map to array and sort by net amount (descending)
      const stats = Array.from(categoryMap.values()).sort(
        (a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount)
      );

      return stats;
    },
    enabled: !!company?.id,
  });
}
