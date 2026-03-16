import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCompany } from "./useCompany";
import { dedupeStatementTransactions, getTransactionDateFromMetadataOriginal } from "@/lib/statementTransactionDedup";

interface StatementExpenseData {
  category: string;
  amount: number;
  date: string;
  description: string;
  transactionId: string;
}

// Fetch transactions from bank statements with specific categories
export function useStatementTransactionsForExpenses() {
  const { data: company } = useCompany();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["statement-transactions-for-expenses", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];

      try {
        // Get all bank statements for the company
        const statementsQuery = (supabase as any)
          .from('bank_statements')
          .select('id')
          .eq('company_id', company.id);

        const { data: statements, error: statementsError } = await statementsQuery;
        if (statementsError) throw statementsError;
        if (!statements || statements.length === 0) return [];

        const statementIds = statements.map((s: any) => s.id);

        // Get all transactions from the statements
        const transactionsQuery = (supabase as any)
          .from('bank_statement_transactions')
          .select('*')
          .in('statement_id', statementIds)
          .order('transaction_date', { ascending: false });

        const { data: allTransactions, error: transactionsError } = await transactionsQuery;
        if (transactionsError) throw transactionsError;
        
        // Filter transactions client-side for category matching (case-insensitive, whitespace-insensitive)
        const targetCategories = ['it expenses', 'office expense'];
        const filteredTransactions = allTransactions.filter((t: any) => {
          if (!t.category) return false;
          const normalized = t.category.trim().toLowerCase().replace(/\s+/g, ' ');
          return targetCategories.includes(normalized);
        });

        const finalDeduped = dedupeStatementTransactions(filteredTransactions as any[]);

        // Deduplicate: filter out transactions that already have an expense
        const transactionIds = finalDeduped.map((t: any) => t.id);
        let importedIds: Set<string> = new Set();
        if (transactionIds.length > 0) {
          const orConditions = transactionIds.map(id => `notes.ilike.%[STMT_TX_${id}]%`).join(",");
          const { data: expenses } = await supabase
            .from("expenses")
            .select("notes")
            .or(orConditions);
          
          importedIds = new Set(
            (expenses || [])
              .map((e: any) => {
                const notes = e.notes || "";
                const match = notes.match(/\[STMT_TX_([^\]]+)\]/);
                return match ? match[1] : null;
              })
              .filter(Boolean)
          );
        }

        const unimportedTransactions = finalDeduped.filter((t: any) => !importedIds.has(t.id));

        const getDateFromMetadata = (metadata: any): string | null => {
          const rawDate = getTransactionDateFromMetadataOriginal(metadata);
          if (!rawDate) return null;

          const value = String(rawDate).trim();

          const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (isoMatch) return value;

          const monthNames: Record<string, string> = {
            jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
            jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
          };

          const dmyNamed = value.match(/^(\d{1,2})[-\/.]([A-Za-z]{3,})[-\/.](\d{4})$/);
          if (dmyNamed) {
            const day = dmyNamed[1].padStart(2, "0");
            const month = monthNames[dmyNamed[2].slice(0, 3).toLowerCase()];
            const year = dmyNamed[3];
            if (month) return `${year}-${month}-${day}`;
          }

          const dmyNumeric = value.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
          if (dmyNumeric) {
            const day = dmyNumeric[1].padStart(2, "0");
            const month = dmyNumeric[2].padStart(2, "0");
            const year = dmyNumeric[3];
            return `${year}-${month}-${day}`;
          }

          return null;
        };

        return unimportedTransactions.map((t: any) => ({
          category: t.category || 'Other',
          amount: Math.abs(t.debit_amount || t.credit_amount || 0),
          date: getDateFromMetadata(t.metadata) || t.transaction_date,
          description: t.description || '',
          transactionId: t.id,
        })) as StatementExpenseData[];
      } catch (error: any) {
        console.error('Error fetching statement transactions:', error);
        return [];
      }
    },
    enabled: !!company?.id,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });
}

// Sync transactions to expenses table
export function useSyncStatementTransactions() {
  const queryClient = useQueryClient();
  const { data: company } = useCompany();

  return useMutation({
    mutationFn: async (transactions: StatementExpenseData[]) => {
      if (!company?.id) throw new Error("Company not found");

      const { data: user } = await supabase.auth.getUser();
      if (!user.user?.id) throw new Error("Not authenticated");

      // Get or create expense categories
      const categories: { [key: string]: string } = {};

      for (const categoryName of ["IT Expenses", "Office expense"]) {
        const { data: existing } = await supabase
          .from("expense_categories")
          .select("id")
          .eq("company_id", company.id)
          .ilike("name", categoryName)
          .maybeSingle();

        if (existing) {
          categories[categoryName] = existing.id;
        } else {
          const { data: newCategory, error } = await supabase
            .from("expense_categories")
            .insert({
              company_id: company.id,
              name: categoryName,
              description: `Auto-imported from bank statements`,
            })
            .select("id")
            .single();

          if (error) throw error;
          if (newCategory) categories[categoryName] = newCategory.id;
        }
      }

      // Check which transaction IDs already have linked expenses
      const transactionIds = transactions.map((t) => t.transactionId);
      let existingExpenses = [];
      if (transactionIds.length > 0) {
        const { data } = await supabase
          .from("expenses")
          .select("id, notes")
          .or(transactionIds.map(id => `notes.ilike.%[STMT_TX_${id}]%`).join(","));
        existingExpenses = data || [];
      }

      const existingTransactionIds = new Set(
        existingExpenses?.map((e) => {
          try {
            const notes = e.notes || "";
            const match = notes.match(/\[STMT_TX_([^\]]+)\]/);
            return match ? match[1] : null;
          } catch {
            return null;
          }
        }) ||[]
      );

      // Filter to only new transactions
      const newTransactions = transactions.filter(
        (t) => !existingTransactionIds.has(t.transactionId)
      );

      if (newTransactions.length === 0) {
        return { created: 0, skipped: transactions.length };
      }

      // Create expenses from transactions
      const expensesToCreate = newTransactions.map((t) => ({
        description: t.description || `${t.category} - Statement Import`,
        amount: t.amount,
        expense_date: t.date,
        category_id: categories[Object.keys(categories).find(
          (key) => key.trim().toLowerCase().replace(/\s+/g, ' ') === t.category.trim().toLowerCase().replace(/\s+/g, ' ')
        ) || ''] || null,
        created_by: user.user!.id,
        status: "pending" as const,
        department: null,
        notes: `[STMT_TX_${t.transactionId}]`, // Store transaction ID for duplicate detection
        receipt_id: null,
        company_id: company.id,
        // source removed, not in schema
      }));

      const { data: createdExpenses, error: insertError } = await supabase
        .from("expenses")
        .insert(expensesToCreate)
        .select();

      if (insertError) throw insertError;

      return {
        created: createdExpenses?.length || 0,
        skipped: existingTransactionIds.size,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-stats"] });

      if (result.created > 0) {
        toast({
          title: "Expenses imported",
          description: `Successfully imported ${result.created} expense(s) from bank statements`,
        });
      } else if (result.skipped > 0) {
        toast({
          title: "No new expenses",
          description: `All ${result.skipped} transactions were already imported`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Auto-sync on statement upload
export function useAutoSyncStatementExpenses() {
  const queryClient = useQueryClient();
  const { data: statementTransactions } = useStatementTransactionsForExpenses();
  const syncMutation = useSyncStatementTransactions();
  const { data: company } = useCompany();

  return useMutation({
    mutationFn: async () => {
      if (!statementTransactions || statementTransactions.length === 0) {
        return { created: 0, skipped: 0 };
      }

      return await syncMutation.mutateAsync(statementTransactions);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statement-transactions-for-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-stats"] });
    },
  });
}

// Listen for real-time changes to bank statements and auto-sync
export function useRealtimeStatementSync() {
  const queryClient = useQueryClient();
  const { data: company } = useCompany();
  const { data: transactions } = useStatementTransactionsForExpenses();
  const syncMutation = useSyncStatementTransactions();

  useEffect(() => {
    if (!company?.id) return;

    // Subscribe to changes on bank_statement_transactions table
    const channel = supabase
      .channel(`bank-statement-transactions:company_${company.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bank_statement_transactions",
        },
        (payload: any) => {
          // Invalidate the query to refetch data
          queryClient.invalidateQueries({
            queryKey: ["statement-transactions-for-expenses", company.id],
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [company?.id, queryClient]);
}

// Automatically sync statement transactions to expenses
let isSyncInProgress = false;
export function useAutoSyncOnLoad() {
  const { data: transactions, isLoading } = useStatementTransactionsForExpenses();
  const syncMutation = useSyncStatementTransactions();
  const { data: company } = useCompany();

  useEffect(() => {
    if (!company?.id || isLoading || !transactions || transactions.length === 0) {
      return;
    }

    // Prevent simultaneous syncs across all instances
    if (isSyncInProgress || syncMutation.isPending) {
      return;
    }

    isSyncInProgress = true;

    // Automatically sync all matching transactions
    syncMutation.mutateAsync(transactions).catch((error) => {
      console.error("Error auto-syncing transactions:", error);
    }).finally(() => {
      isSyncInProgress = false;
    });
  }, [company?.id]); // Only depend on company ID to avoid repeated syncs
}

