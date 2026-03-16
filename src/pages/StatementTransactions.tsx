import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useBankStatements, useBankStatementTransactions } from "@/hooks/useStatements";
import { useCompany } from "@/hooks/useCompany";
import { getTransactionDateFromMetadataOriginal, getValueDateFromMetadataOriginal } from "@/lib/statementTransactionDedup";

const StatementTransactions = () => {
  const { statementId } = useParams<{ statementId: string }>();
  const navigate = useNavigate();
  const { data: statements } = useBankStatements();
  const { data: transactions, isLoading: transactionsLoading } = useBankStatementTransactions(statementId || null, { dedupe: true });
  const { data: company } = useCompany();

  // Find the selected statement
  const selectedStatement = statements?.find((s: any) => s.id === statementId);

  // Sort transactions by metadata.transaction_date in descending order (newest first)
  const sortedTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    // Extract transaction date from metadata helper
    const getTransactionDateFromMetadata = (metadata: any): string | null => {
      if (!metadata) return null;
      
      const dateStr = getTransactionDateFromMetadataOriginal(metadata);
      
      if (!dateStr) return null;
      
      // Helper function to format date using local components (avoid timezone issues)
      const formatDateLocal = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      // Manual parsing for format "DD-MMM-YYYY" (e.g., "14-May-2025") - preferred method
      const parts = String(dateStr).trim().split('-');
      if (parts.length === 3) {
        const day = parts[0].trim().padStart(2, '0');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = parts[1].trim();
        const month = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
        const year = parts[2].trim();
        
        if (month >= 0 && day && year) {
          const monthStr = String(month + 1).padStart(2, '0');
          return `${year}-${monthStr}-${day}`;
        }
      }
      
      // Try standard Date parsing (fallback for other formats)
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          // Use local date components instead of toISOString() to avoid timezone shifts
          return formatDateLocal(date);
        }
      } catch (e) {
        // Ignore
      }
      
      return null;
    };
    
    return [...transactions].sort((a: any, b: any) => {
      // Get transaction date from metadata, fallback to transaction_date column
      const dateA = getTransactionDateFromMetadata(a.metadata) || a.transaction_date;
      const dateB = getTransactionDateFromMetadata(b.metadata) || b.transaction_date;
      
      // Parse dates
      const dateAValue = dateA ? new Date(dateA).getTime() : 0;
      const dateBValue = dateB ? new Date(dateB).getTime() : 0;
      
      // Sort in descending order (newest first)
      return dateBValue - dateAValue;
    });
  }, [transactions]);

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: company?.currency || "INR",
    }).format(amount);
  };

  if (!selectedStatement) {
    return (
      <DashboardLayout>
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/statement")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Statements
          </Button>
          <div className="p-6 text-center text-muted-foreground">
            Statement not found
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/statement")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Statements
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transaction Details</h1>
          <p className="text-muted-foreground">
            {selectedStatement.file_name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Statement Information</CardTitle>
              <CardDescription>
                Period: {(() => {
                  // Get first and last transaction dates from transactions array
                  if (transactions && transactions.length > 0) {
                    // Sort transactions by date to get first and last
                    const sorted = [...transactions].sort((a, b) => {
                      const getDate = (txn: any) => {
                        const metadata = txn.metadata as any;
                        const dateStr = metadata?.original_data?.["Transaction Date"] || 
                                      metadata?.all_columns?.find((col: any) => 
                                        col.header?.toLowerCase().includes("transaction date")
                                      )?.value;
                        if (dateStr) {
                          const parts = String(dateStr).trim().split('-');
                          if (parts.length === 3) {
                            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            const month = monthNames.findIndex(m => m.toLowerCase() === parts[1].trim().toLowerCase());
                            if (month >= 0) {
                              return new Date(parseInt(parts[2]), month, parseInt(parts[0]));
                            }
                          }
                        }
                        return txn.transaction_date ? new Date(txn.transaction_date) : new Date(0);
                      };
                      return getDate(a).getTime() - getDate(b).getTime();
                    });
                    
                    const firstTransaction = sorted[0];
                    const lastTransaction = sorted[sorted.length - 1];
                    
                    const firstDate = getTransactionDateFromMetadataOriginal(firstTransaction.metadata) || firstTransaction.transaction_date;
                    const lastDate = getTransactionDateFromMetadataOriginal(lastTransaction.metadata) || lastTransaction.transaction_date;
                    
                    if (firstDate && lastDate) {
                      try {
                        // Try to parse the original format first
                        const partsFirst = String(firstDate).trim().split('-');
                        const partsLast = String(lastDate).trim().split('-');
                        
                        if (partsFirst.length === 3 && partsLast.length === 3) {
                          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                          const monthFirst = monthNames.findIndex(m => m.toLowerCase() === partsFirst[1].trim().toLowerCase());
                          const monthLast = monthNames.findIndex(m => m.toLowerCase() === partsLast[1].trim().toLowerCase());
                          
                          if (monthFirst >= 0 && monthLast >= 0) {
                            const firstDateObj = new Date(parseInt(partsFirst[2]), monthFirst, parseInt(partsFirst[0]));
                            const lastDateObj = new Date(parseInt(partsLast[2]), monthLast, parseInt(partsLast[0]));
                            
                            if (!isNaN(firstDateObj.getTime()) && !isNaN(lastDateObj.getTime())) {
                              return `${format(firstDateObj, "MMM d, yyyy")} - ${format(lastDateObj, "MMM d, yyyy")}`;
                            }
                          }
                        }
                        
                        // Fallback to standard date parsing
                        const firstDateObj = new Date(firstDate);
                        const lastDateObj = new Date(lastDate);
                        
                        if (!isNaN(firstDateObj.getTime()) && !isNaN(lastDateObj.getTime())) {
                          return `${format(firstDateObj, "MMM d, yyyy")} - ${format(lastDateObj, "MMM d, yyyy")}`;
                        }
                      } catch (e) {
                        // Ignore
                      }
                    }
                  }
                  return 'N/A';
                })()}
              </CardDescription>
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Opening Balance</p>
                <p className="font-semibold">{formatCurrency(selectedStatement.opening_balance)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Closing Balance</p>
                <p className="font-semibold">{formatCurrency(selectedStatement.closing_balance)}</p>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Transactions Table */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transaction Details</CardTitle>
              <CardDescription>
                Showing {sortedTransactions?.length || 0} transactions from the selected statement
              </CardDescription>
            </div>
            {sortedTransactions && sortedTransactions.length > 0 && (
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Debit Transactions</p>
                  <p className="text-red-600 font-bold text-lg">
                    {(sortedTransactions as any[]).filter((t: any) => t.debit_amount > 0).length}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Credit Transactions</p>
                  <p className="text-green-600 font-bold text-lg">
                    {(sortedTransactions as any[]).filter((t: any) => t.credit_amount > 0).length}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {transactionsLoading ? (
            <div className="p-6">
              <Skeleton className="h-10 w-full mb-2" />
              <Skeleton className="h-10 w-full mb-2" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : sortedTransactions && sortedTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Value Date</TableHead>
                    <TableHead className="min-w-[250px]">Transaction Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right min-w-[140px] font-semibold">Debit Amount</TableHead>
                    <TableHead className="text-right min-w-[140px] font-semibold">Credit Amount</TableHead>
                    <TableHead className="text-right min-w-[140px] font-semibold">Balance</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTransactions?.map((transaction: any, index: number) => {
                    const metadata = transaction.metadata as any;
                    const allColumns = metadata?.all_columns || [];
                    
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-medium text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            // Extract Transaction Date from metadata column in its original format
                            const metadataDate = getTransactionDateFromMetadataOriginal(metadata);
                            // Use metadata date if available (already in original format like "14-May-2025")
                            if (metadataDate) {
                              return metadataDate;
                            } else if (transaction.transaction_date) {
                              // Fallback to transaction_date if metadata doesn't have date
                              return format(new Date(transaction.transaction_date), "MMM d, yyyy");
                            } else {
                              return "—";
                            }
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            // Extract Value Date from metadata column in its original format
                            const metadataValueDate = getValueDateFromMetadataOriginal(metadata);
                            // Use metadata date if available (already in original format like "14-May-2025")
                            if (metadataValueDate) {
                              return metadataValueDate;
                            } else if (transaction.value_date) {
                              // Fallback to value_date if metadata doesn't have date
                              return format(new Date(transaction.value_date), "MMM d, yyyy");
                            } else {
                              return "—";
                            }
                          })()}
                        </TableCell>
                        <TableCell className="min-w-[400px] max-w-[600px]">
                          <div className="space-y-1">
                            {/* Show full transaction description exactly as in Excel */}
                            <div className="text-sm font-medium break-words leading-relaxed" title={transaction.description}>
                              {transaction.description || "—"}
                            </div>
                            {allColumns.length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                  View all {allColumns.length} columns
                                </summary>
                                <div className="mt-2 text-xs space-y-1 max-h-60 overflow-y-auto bg-muted/50 p-3 rounded border">
                                  {allColumns.map((col: any, idx: number) => (
                                    <div key={idx} className="flex justify-between gap-4 py-1 border-b border-border/50 last:border-0">
                                      <span className="font-semibold text-muted-foreground min-w-[120px]">{col.header}:</span>
                                      <span className="text-foreground break-words text-right flex-1">{String(col.value || "—")}</span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{transaction.reference_number || "—"}</span>
                        </TableCell>
                        <TableCell className="text-right text-red-600 font-semibold">
                          {(() => {
                            const metadata = transaction.metadata as any;
                            const originalDebit = metadata?.original_debit;
                            
                            // Always show debit amount if it exists
                            if (transaction.debit_amount > 0) {
                              // Prefer original Excel format, fallback to formatted
                              if (originalDebit && originalDebit !== "" && originalDebit !== "0") {
                                return (
                                  <div className="whitespace-nowrap font-semibold">
                                    {originalDebit}
                                  </div>
                                );
                              }
                              return (
                                <div className="whitespace-nowrap font-semibold">
                                  {formatCurrency(transaction.debit_amount)}
                                </div>
                              );
                            }
                            return <span className="text-muted-foreground">—</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-semibold">
                          {(() => {
                            const metadata = transaction.metadata as any;
                            const originalCredit = metadata?.original_credit;
                            
                            // Always show credit amount if it exists
                            if (transaction.credit_amount > 0) {
                              // ALWAYS prefer original Excel format if available (preserves exact formatting like "30,000.00")
                              if (originalCredit && originalCredit !== "" && originalCredit !== "0" && originalCredit !== "0.00") {
                                return (
                                  <div className="whitespace-nowrap font-semibold">
                                    {originalCredit}
                                  </div>
                                );
                              }
                              // Fallback to formatted currency only if original not available
                              return (
                                <div className="whitespace-nowrap font-semibold">
                                  {formatCurrency(transaction.credit_amount)}
                                </div>
                              );
                            }
                            return <span className="text-muted-foreground">—</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {(() => {
                            const metadata = transaction.metadata as any;
                            const originalBalance = metadata?.original_balance;
                            // Show original Excel format if available, otherwise format the number
                            if (originalBalance && originalBalance !== "" && originalBalance !== "0") {
                              return <span className="whitespace-nowrap">{originalBalance}</span>;
                            }
                            return transaction.balance !== null && transaction.balance !== undefined ? (
                              <span className="whitespace-nowrap">{formatCurrency(transaction.balance)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            transaction.transaction_type === "debit" ? "destructive" :
                            transaction.transaction_type === "credit" ? "default" : "secondary"
                          }>
                            {transaction.transaction_type}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground">
              No transactions found. The Excel file may not have been parsed correctly.
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default StatementTransactions;
