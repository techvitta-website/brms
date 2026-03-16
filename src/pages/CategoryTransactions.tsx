import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { dedupeStatementTransactions, getTransactionDateFromMetadataOriginal } from "@/lib/statementTransactionDedup";

type CategoryTransaction = {
  id: string;
  metadata?: any;
  transaction_date: string | null;
  description: string | null;
  category: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
};

const CategoryTransactions = () => {
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category")?.trim() || "";
  const { data: company } = useCompany();
  const currency = company?.currency || "INR";

  const [transactions, setTransactions] = useState<CategoryTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const extractModeOfPayment = (description: string | null) => {
    if (!description) return "—";
    const parts = String(description).split("/");
    return parts[0]?.trim() || "—";
  };

  const getTransactionDateFromMetadata = (metadata: any): string | null => {
    const dateStr = getTransactionDateFromMetadataOriginal(metadata);
    if (!dateStr) return null;

    const parts = String(dateStr).trim().split("-");
    if (parts.length === 3) {
      const day = parts[0].trim().padStart(2, "0");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthName = parts[1].trim();
      const month = monthNames.findIndex((m) => m.toLowerCase() === monthName.toLowerCase());
      const year = parts[2].trim();

      if (month >= 0 && day && year) {
        const monthStr = String(month + 1).padStart(2, "0");
        return `${year}-${monthStr}-${day}`;
      }
    }

    try {
      const date = new Date(dateStr);
      if (!Number.isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    } catch {
      return null;
    }

    return null;
  };

  const formatTransactionDate = (dateValue: string | null) => {
    if (!dateValue) return "—";
    try {
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return dateValue;
      return format(date, "MMM d, yyyy");
    } catch {
      return dateValue;
    }
  };

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const dateA = getTransactionDateFromMetadata(a.metadata) || a.transaction_date;
      const dateB = getTransactionDateFromMetadata(b.metadata) || b.transaction_date;
      const timeA = dateA ? new Date(dateA).getTime() : 0;
      const timeB = dateB ? new Date(dateB).getTime() : 0;
      return timeB - timeA;
    });
  }, [transactions]);

  useEffect(() => {
    const fetchCategoryTransactions = async () => {
      if (!category || !company?.id) {
        setTransactions([]);
        return;
      }

      setLoading(true);
      try {
        const { data: statements, error: statementsError } = await (supabase as any)
          .from("bank_statements")
          .select("id")
          .eq("company_id", company.id);

        if (statementsError) throw statementsError;
        if (!statements || statements.length === 0) {
          setTransactions([]);
          return;
        }

        const statementIds = statements.map((statement: any) => statement.id);
        const { data, error } = await (supabase as any)
          .from("bank_statement_transactions")
          .select("id, metadata, transaction_date, description, category, debit_amount, credit_amount")
          .in("statement_id", statementIds)
          .eq("category", category)
          .order("transaction_date", { ascending: false });

        if (error) throw error;
        setTransactions(dedupeStatementTransactions(((data || []) as unknown) as CategoryTransaction[]));
      } catch (error) {
        console.error("Failed to fetch category transactions:", error);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategoryTransactions();
  }, [category, company?.id]);

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{category || "Category"} Transactions</h1>
            <p className="text-muted-foreground">
              Showing all transactions for the selected dashboard category
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/">Back to Dashboard</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {category ? `Filtered by category: ${category}` : "No category selected"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!category ? (
            <div className="p-6 text-sm text-muted-foreground">No category selected.</div>
          ) : loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : sortedTransactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Mode of Payment</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{formatTransactionDate(getTransactionDateFromMetadata(transaction.metadata) || transaction.transaction_date)}</TableCell>
                    <TableCell className="whitespace-normal break-words">{transaction.description || "—"}</TableCell>
                    <TableCell>{transaction.category || "—"}</TableCell>
                    <TableCell>{extractModeOfPayment(transaction.description)}</TableCell>
                    <TableCell className="text-right text-red-600">
                      {transaction.debit_amount ? formatCurrency(transaction.debit_amount, currency) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {transaction.credit_amount ? formatCurrency(transaction.credit_amount, currency) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">No transactions found for this category.</div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default CategoryTransactions;
