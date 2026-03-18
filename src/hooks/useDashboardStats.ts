import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { dedupeStatementTransactions } from "@/lib/statementTransactionDedup";

interface DashboardStats {
  totalReceipts: number;
  receiptsChange: number;
  totalExpenses: number;
  totalExternalExpenses: number;
  expensesChange: number;
  expensesNetAmount: number; // Net amount (credit - debit) for expense categories
  expensesTransactionCount: number; // Transaction count for expense categories
  pendingInvoices: number;
  pendingInvoicesCount: number;
  monthlyProfit: number;
  profitChange: number;
  overdueInvoices: { count: number; total: number };
}

export function useDashboardStats() {
  const { data: company } = useCompany();

  return useQuery({
    queryKey: ["dashboard-stats", company?.id],
    queryFn: async (): Promise<DashboardStats> => {
      if (!company?.id) {
        // Return default values if no company
        return {
          totalReceipts: 0,
          receiptsChange: 0,
          totalExpenses: 0,
          totalExternalExpenses: 0,
          expensesChange: 0,
          expensesNetAmount: 0,
          expensesTransactionCount: 0,
          pendingInvoices: 0,
          pendingInvoicesCount: 0,
          monthlyProfit: 0,
          profitChange: 0,
          overdueInvoices: { count: 0, total: 0 },
        };
      }
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      // Fetch receipts for current month
      const { data: currentReceipts } = await supabase
        .from("receipts")
        .select("amount")
        .gte("receipt_date", currentMonthStart.toISOString().split("T")[0]);

      // Fetch receipts for last month
      const { data: lastReceipts } = await supabase
        .from("receipts")
        .select("amount")
        .gte("receipt_date", lastMonthStart.toISOString().split("T")[0])
        .lte("receipt_date", lastMonthEnd.toISOString().split("T")[0]);

      // Fetch category-based expenses from bank statement transactions ONLY
      // Categories: 'IT Expenses', 'Office expense', 'Payroll'
      const expenseCategories = ['IT Expenses', 'Office expense', 'Payroll'];
      
      // Get all statement IDs for this company
      const { data: statements } = await supabase
        .from("bank_statements" as any)
        .select("id")
        .eq("company_id", company.id);

      let currentMonthCategoryExpenses = 0;
      let currentMonthCategoryExpensesNet = 0;
      let currentMonthCategoryTransactionCount = 0;
      let lastMonthCategoryExpenses = 0;
      let lastMonthCategoryExpensesNet = 0;
      let lastMonthCategoryTransactionCount = 0;

      if (statements && statements.length > 0) {
        const statementIds = (statements as any[]).map((s) => s.id);
        const currentMonthStartStr = currentMonthStart.toISOString().split("T")[0];
        const currentMonthEndStr = now.toISOString().split("T")[0];
        const lastMonthStartStr = lastMonthStart.toISOString().split("T")[0];
        const lastMonthEndStr = lastMonthEnd.toISOString().split("T")[0];

        // Fetch transactions for current month with expense categories
        const { data: currentMonthCategoryTransactions } = await supabase
          .from("bank_statement_transactions" as any)
          .select("debit_amount, credit_amount, transaction_date, value_date, description, transaction_type, metadata")
          .in("statement_id", statementIds)
          .in("category", expenseCategories)
          .gte("transaction_date", currentMonthStartStr)
          .lte("transaction_date", currentMonthEndStr);

        // Fetch transactions for last month with expense categories
        const { data: lastMonthCategoryTransactions } = await supabase
          .from("bank_statement_transactions" as any)
          .select("debit_amount, credit_amount, transaction_date, value_date, description, transaction_type, metadata")
          .in("statement_id", statementIds)
          .in("category", expenseCategories)
          .gte("transaction_date", lastMonthStartStr)
          .lte("transaction_date", lastMonthEndStr);

        // Calculate totals for current month (net amount = credit - debit)
        if (currentMonthCategoryTransactions) {
          const currentMonthDedupedTransactions = dedupeStatementTransactions(currentMonthCategoryTransactions as any[]);
          currentMonthCategoryTransactionCount = currentMonthDedupedTransactions.length;
          const totalDebit = currentMonthDedupedTransactions.reduce(
            (sum, t: any) => sum + (Number(t.debit_amount) || 0),
            0
          );
          const totalCredit = currentMonthDedupedTransactions.reduce(
            (sum, t: any) => sum + (Number(t.credit_amount) || 0),
            0
          );
          currentMonthCategoryExpenses = totalDebit;
          currentMonthCategoryExpensesNet = totalCredit - totalDebit; // Net amount
        }

        // Calculate totals for last month
        if (lastMonthCategoryTransactions) {
          const lastMonthDedupedTransactions = dedupeStatementTransactions(lastMonthCategoryTransactions as any[]);
          lastMonthCategoryTransactionCount = lastMonthDedupedTransactions.length;
          const totalDebit = lastMonthDedupedTransactions.reduce(
            (sum, t: any) => sum + (Number(t.debit_amount) || 0),
            0
          );
          const totalCredit = lastMonthDedupedTransactions.reduce(
            (sum, t: any) => sum + (Number(t.credit_amount) || 0),
            0
          );
          lastMonthCategoryExpenses = totalDebit;
          lastMonthCategoryExpensesNet = totalCredit - totalDebit; // Net amount
        }
      }

      // Fetch PAID invoices for current month
      // Only paid invoices represent actual income (money received)
      // Use paid_date to determine when the income was received
      const { data: currentMonthPaidInvoices } = await supabase
        .from("invoices")
        .select("total, paid_date")
        .eq("status", "paid")
        .not("paid_date", "is", null)
        .gte("paid_date", currentMonthStart.toISOString().split("T")[0])
        .lte("paid_date", now.toISOString().split("T")[0]);

      // Fetch PAID invoices for last month
      const { data: lastMonthPaidInvoices } = await supabase
        .from("invoices")
        .select("total, paid_date")
        .eq("status", "paid")
        .not("paid_date", "is", null)
        .gte("paid_date", lastMonthStart.toISOString().split("T")[0])
        .lte("paid_date", lastMonthEnd.toISOString().split("T")[0]);

      // Fetch pending invoices
      const { data: pendingInvoices } = await supabase
        .from("invoices")
        .select("total")
        .in("status", ["pending", "sent"]);

      // Fetch all external expenses for company (all-time total)
      const { data: externalExpenses } = await (supabase as any)
        .from("external_expenses")
        .select("amount")
        .eq("company_id", company.id);

      // Fetch overdue invoices
      const today = now.toISOString().split("T")[0];
      const { data: overdueInvoices } = await supabase
        .from("invoices")
        .select("total")
        .lt("due_date", today)
        .in("status", ["pending", "sent"]);

      // Calculate totals
      const totalReceipts = currentReceipts?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
      const lastTotalReceipts = lastReceipts?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
      const receiptsChange = lastTotalReceipts > 0 
        ? ((totalReceipts - lastTotalReceipts) / lastTotalReceipts) * 100 
        : 0;

      // Use only category-based expenses (no expenses table)
      const totalExpenses = currentMonthCategoryExpenses;
      const lastTotalExpenses = lastMonthCategoryExpenses;
      
      const expensesChange = lastTotalExpenses > 0 
        ? ((totalExpenses - lastTotalExpenses) / lastTotalExpenses) * 100 
        : 0;

      const pendingTotal = pendingInvoices?.reduce((sum, i) => sum + Number(i.total), 0) || 0;
      const overdueTotal = overdueInvoices?.reduce((sum, i) => sum + Number(i.total), 0) || 0;
      const totalExternalExpenses = (externalExpenses || []).reduce(
        (sum: number, exp: any) => sum + Number(exp.amount || 0),
        0
      );

      // Calculate invoice income for current month
      // Only count PAID invoices as income (money actually received)
      const totalInvoices = currentMonthPaidInvoices?.reduce((sum, i) => {
        return sum + Number(i.total || 0);
      }, 0) || 0;

      // Calculate invoice income for last month
      // Only count PAID invoices as income
      const lastTotalInvoices = lastMonthPaidInvoices?.reduce((sum, i) => {
        return sum + Number(i.total || 0);
      }, 0) || 0;

      // Calculate monthly profit: (Paid Invoices ONLY) - Expenses
      // Receipts are NOT included in income calculation - only paid invoices count as income
      const totalIncome = totalInvoices; // Only paid invoices, NOT receipts
      const lastTotalIncome = lastTotalInvoices; // Only paid invoices, NOT receipts
      const monthlyProfit = totalIncome - totalExpenses;
      const lastMonthlyProfit = lastTotalIncome - lastTotalExpenses;
      const profitChange = lastMonthlyProfit !== 0 
        ? ((monthlyProfit - lastMonthlyProfit) / Math.abs(lastMonthlyProfit)) * 100 
        : (monthlyProfit > 0 ? 100 : (monthlyProfit < 0 ? -100 : 0));

      // Debug logging
      console.log('[Dashboard Stats] Monthly Profit Calculation:', {
        totalReceipts: totalReceipts, // Receipts are NOT included in income
        paidInvoicesCount: currentMonthPaidInvoices?.length || 0,
        totalInvoices, // Only paid invoices count as income
        totalIncome, // Only paid invoices (receipts excluded)
        totalExpenses,
        monthlyProfit,
        profitChange,
        calculation: `(${totalInvoices} paid invoices) - ${totalExpenses} expenses = ${monthlyProfit} profit`
      });

      return {
        totalReceipts,
        receiptsChange,
        totalExpenses,
        totalExternalExpenses,
        expensesChange,
        expensesNetAmount: currentMonthCategoryExpensesNet,
        expensesTransactionCount: currentMonthCategoryTransactionCount,
        pendingInvoices: pendingTotal,
        pendingInvoicesCount: pendingInvoices?.length || 0,
        monthlyProfit: monthlyProfit || 0, // Ensure it's never undefined
        profitChange: profitChange || 0, // Ensure it's never undefined
        overdueInvoices: {
          count: overdueInvoices?.length || 0,
          total: overdueTotal,
        },
      };
    },
    enabled: !!company?.id,
  });
}

export interface CashFlowData {
  month: string;
  income: number;
  expenses: number;
}

export function useCashFlowData() {
  return useQuery({
    queryKey: ["cash-flow-data"],
    queryFn: async (): Promise<CashFlowData[]> => {
      const now = new Date();
      const months: CashFlowData[] = [];

      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthName = monthStart.toLocaleDateString("en-US", { month: "short" });

        // Fetch receipts for income
        const { data: receipts } = await supabase
          .from("receipts")
          .select("amount")
          .gte("receipt_date", monthStart.toISOString().split("T")[0])
          .lte("receipt_date", monthEnd.toISOString().split("T")[0]);

        // Fetch PAID invoices for income
        // Only paid invoices represent actual income (money received)
        // For cash flow, we can use either paid_date (when money was received) or issue_date (when invoice was issued)
        // Let's fetch all paid invoices and filter by both paid_date and issue_date to catch all cases
        const monthStartStr = monthStart.toISOString().split("T")[0];
        const monthEndStr = monthEnd.toISOString().split("T")[0];
        
        // First, try to get invoices with paid_date in this month
        const { data: paidInvoicesByPaidDate, error: paidDateError } = await supabase
          .from("invoices")
          .select("total, paid_date, issue_date, status, invoice_number")
          .eq("status", "paid")
          .not("paid_date", "is", null)
          .gte("paid_date", monthStartStr)
          .lte("paid_date", monthEndStr);

        // Also get paid invoices with issue_date in this month (in case paid_date is not set or is in different month)
        const { data: paidInvoicesByIssueDate, error: issueDateError } = await supabase
          .from("invoices")
          .select("total, paid_date, issue_date, status, invoice_number")
          .eq("status", "paid")
          .gte("issue_date", monthStartStr)
          .lte("issue_date", monthEndStr);

        // Combine both results, removing duplicates
        const allPaidInvoicesForMonth = new Map();
        
        // Add invoices by paid_date
        paidInvoicesByPaidDate?.forEach(inv => {
          allPaidInvoicesForMonth.set(inv.invoice_number || inv.total, inv);
        });
        
        // Add invoices by issue_date (if not already added)
        paidInvoicesByIssueDate?.forEach(inv => {
          if (!allPaidInvoicesForMonth.has(inv.invoice_number || inv.total)) {
            allPaidInvoicesForMonth.set(inv.invoice_number || inv.total, inv);
          }
        });
        
        const paidInvoices = Array.from(allPaidInvoicesForMonth.values());

        // Debug: Log if there's an error or if we're not finding paid invoices
        if (paidDateError) {
          console.error(`[CashFlow] Error fetching paid invoices by paid_date for ${monthName}:`, paidDateError);
        }
        if (issueDateError) {
          console.error(`[CashFlow] Error fetching paid invoices by issue_date for ${monthName}:`, issueDateError);
        }
        
        // Additional debug: Check if there are any paid invoices at all (for debugging)
        if (paidInvoices.length === 0) {
          const { data: allPaidInvoices } = await supabase
            .from("invoices")
            .select("total, paid_date, issue_date, status, invoice_number")
            .eq("status", "paid")
            .limit(20);
          
          if (allPaidInvoices && allPaidInvoices.length > 0) {
            console.log(`[CashFlow Debug] Found ${allPaidInvoices.length} paid invoices in DB, checking dates for ${monthName}:`, {
              month: monthName,
              dateRange: `${monthStartStr} to ${monthEndStr}`,
              allPaidInvoices: allPaidInvoices.map(inv => ({
                invoice_number: inv.invoice_number,
                total: inv.total,
                paid_date: inv.paid_date,
                issue_date: inv.issue_date,
                paidDateInRange: inv.paid_date ? (inv.paid_date >= monthStartStr && inv.paid_date <= monthEndStr) : false,
                issueDateInRange: inv.issue_date ? (inv.issue_date >= monthStartStr && inv.issue_date <= monthEndStr) : false
              }))
            });
          }
        }

        // Fetch expenses
        const { data: expenses } = await supabase
          .from("expenses")
          .select("amount")
          .gte("expense_date", monthStart.toISOString().split("T")[0])
          .lte("expense_date", monthEnd.toISOString().split("T")[0]);

        // Calculate income from receipts
        const receiptsIncome = receipts?.reduce((sum, r) => {
          const amount = Number(r.amount) || 0;
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0) || 0;
        
        // Calculate income from PAID invoices (using paid_date or issue_date - when money was received or invoice was issued)
        // Only paid invoices represent actual income
        const paidInvoicesIncome = paidInvoices.reduce((sum, inv) => {
          const total = Number(inv.total) || 0;
          return sum + (isNaN(total) ? 0 : total);
        }, 0);

        // Total income = paid invoices ONLY (receipts are NOT included in income)
        // CRITICAL: Do NOT add expenses to income, and do NOT add receipts to income
        const totalIncome = paidInvoicesIncome; // Only paid invoices, NOT receipts

        // Calculate expenses separately (ONLY expenses - never mix with income)
        // CRITICAL: Expenses are completely separate from income
        const totalExpenses = expenses?.reduce((sum, e) => {
          const amount = Number(e.amount) || 0;
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0) || 0;

        // Debug logging for all months to verify paid invoices are being included
        console.log(`[CashFlow Debug - ${monthName}]`, {
          receiptsCount: receipts?.length || 0,
          receiptsIncome,
          paidInvoicesQuery: {
            status: "paid",
            paidDateRange: `${monthStartStr} to ${monthEndStr}`,
            count: paidInvoices.length || 0,
            byPaidDate: paidInvoicesByPaidDate?.length || 0,
            byIssueDate: paidInvoicesByIssueDate?.length || 0,
            combined: paidInvoices.length,
            paidDateError: paidDateError || null,
            issueDateError: issueDateError || null
          },
          paidInvoicesCount: paidInvoices.length || 0,
          paidInvoicesData: paidInvoices.map(inv => ({ 
            invoice_number: inv.invoice_number,
            total: inv.total, 
            paid_date: inv.paid_date,
            issue_date: inv.issue_date
          })) || [],
          paidInvoicesIncome,
          totalIncome,
          expensesCount: expenses?.length || 0,
          totalExpenses,
          incomeShouldBe: totalIncome,
          expensesShouldBe: totalExpenses
        });

        // CRITICAL: Ensure income and expenses are NEVER mixed
        // Income MUST only come from PAID invoices (receipts are NOT included)
        // Expenses MUST only come from expenses table
        // If there's no income (paidInvoices=0), income MUST be 0, NOT expenses
        
        // ABSOLUTE RULE #1: Income = PAID invoices ONLY (receipts excluded)
        // If paidInvoices=0, then income MUST be 0 (regardless of expenses or receipts)
        let finalIncome = paidInvoicesIncome; // Only paid invoices, NOT receipts
        
        // ABSOLUTE RULE #2: If there are no paid invoices, income is ALWAYS 0
        if (paidInvoicesIncome === 0) {
          finalIncome = 0; // Force to 0 - never use expenses value or receipts
        }

        // ABSOLUTE RULE #3: Expenses are completely separate
        const finalExpenses = totalExpenses;

        // ABSOLUTE RULE #4: Income can NEVER equal expenses unless both are 0
        // If they're equal and non-zero, it means income was incorrectly calculated
        // Force income to 0 in this case
        if (finalIncome > 0 && finalExpenses > 0 && finalIncome === finalExpenses) {
          console.error(`[CashFlow Error] Income equals expenses for ${monthName}. This indicates a bug.`, {
            receiptsIncome, // Receipts are NOT included in income
            paidInvoicesIncome,
            calculatedIncome: finalIncome,
            totalExpenses: finalExpenses,
            receiptsCount: receipts?.length || 0,
            paidInvoicesCount: paidInvoices?.length || 0,
            expensesCount: expenses?.length || 0
          });
          // If income equals expenses and we have no paid invoices, income must be 0
          if (paidInvoicesIncome === 0) {
            finalIncome = 0;
          }
        }

        const monthData: CashFlowData = {
          month: monthName,
          income: Math.max(0, finalIncome), // ONLY paid invoices, NEVER expenses or receipts
          expenses: Math.max(0, finalExpenses), // ONLY expenses, NEVER receipts or invoices
        };

        // Final validation: Double-check that income is correct
        // If income > 0 but we have no paid invoices, something is wrong (receipts don't count as income)
        if (monthData.income > 0 && paidInvoicesIncome === 0) {
          console.error(`[CashFlow Error] Income is ${monthData.income} but paid invoices are 0 for ${monthName}. Forcing income to 0.`);
          monthData.income = 0;
        }

        // Final safety check: Income should never equal expenses unless both are 0
        if (monthData.income === monthData.expenses && monthData.income > 0) {
          console.error(`[CashFlow Error] Final check failed for ${monthName}. Income=${monthData.income}, Expenses=${monthData.expenses}. Setting income to 0.`);
          monthData.income = 0;
        }

        months.push(monthData);
      }

      return months;
    },
  });
}

export interface ExpenseCategory {
  name: string;
  value: number;
  color: string;
}

const CATEGORY_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function useExpenseBreakdown() {
  return useQuery({
    queryKey: ["expense-breakdown"],
    queryFn: async (): Promise<ExpenseCategory[]> => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data: expenses } = await supabase
        .from("expenses")
        .select("amount, category_id, expense_categories(name)")
        .gte("expense_date", monthStart.toISOString().split("T")[0]);

      // Group by category
      const categoryMap = new Map<string, number>();
      expenses?.forEach((expense) => {
        const categoryName = (expense.expense_categories as any)?.name || "Uncategorized";
        const current = categoryMap.get(categoryName) || 0;
        categoryMap.set(categoryName, current + Number(expense.amount));
      });

      // Convert to array with colors
      const categories: ExpenseCategory[] = [];
      let colorIndex = 0;
      categoryMap.forEach((value, name) => {
        categories.push({
          name,
          value,
          color: CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length],
        });
        colorIndex++;
      });

      return categories.sort((a, b) => b.value - a.value).slice(0, 5);
    },
  });
}

export interface RecentActivityItem {
  id: string;
  type: "receipt" | "expense" | "invoice";
  description: string;
  amount: number;
  date: string;
  status: string;
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ["recent-activity"],
    queryFn: async (): Promise<RecentActivityItem[]> => {
      // Fetch recent receipts
      const { data: receipts } = await supabase
        .from("receipts")
        .select("id, vendor, amount, created_at, status")
        .order("created_at", { ascending: false })
        .limit(3);

      // Fetch recent expenses
      const { data: expenses } = await supabase
        .from("expenses")
        .select("id, description, amount, created_at, status")
        .order("created_at", { ascending: false })
        .limit(3);

      // Fetch recent invoices
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, client_name, total, created_at, status")
        .order("created_at", { ascending: false })
        .limit(3);

      const activities: RecentActivityItem[] = [];

      receipts?.forEach((r) => {
        activities.push({
          id: r.id,
          type: "receipt",
          description: `Receipt from ${r.vendor}`,
          amount: Number(r.amount),
          date: r.created_at,
          status: r.status || "pending",
        });
      });

      expenses?.forEach((e) => {
        activities.push({
          id: e.id,
          type: "expense",
          description: e.description,
          amount: Number(e.amount),
          date: e.created_at,
          status: e.status || "pending",
        });
      });

      invoices?.forEach((i) => {
        activities.push({
          id: i.id,
          type: "invoice",
          description: `Invoice for ${i.client_name}`,
          amount: Number(i.total),
          date: i.created_at,
          status: i.status || "draft",
        });
      });

      // Sort by date and take top 8
      return activities
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8);
    },
  });
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  client: string;
  amount: number;
  status: string;
  dueDate: string;
}

export function useRecentInvoices() {
  return useQuery({
    queryKey: ["recent-invoices"],
    queryFn: async (): Promise<InvoiceItem[]> => {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, client_name, total, status, due_date")
        .order("created_at", { ascending: false })
        .limit(5);

      return (
        invoices?.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoice_number,
          client: i.client_name,
          amount: Number(i.total),
          status: i.status || "draft",
          dueDate: i.due_date,
        })) || []
      );
    },
  });
}
