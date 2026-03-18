import { useMemo, useState } from "react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, DollarSign, Eye, Plus, Receipt, Search, CheckCircle, Clock, XCircle } from "lucide-react";
import { ExternalExpenseActions } from "@/components/expenses/ExternalExpenseActions";
import { ExternalExpenseDialog } from "@/components/expenses/ExternalExpenseDialog";
import { RejectExpenseDialog } from "@/components/expenses/RejectExpenseDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useHasDelegatedAuthority } from "@/hooks/useExpenseDelegations";
import { toast } from "@/hooks/use-toast";
import {
  ExternalExpense,
  useDeleteExternalExpense,
  useExternalExpenses,
  useExternalExpenseStats,
  useRejectExternalExpense,
} from "@/hooks/useExternalExpenses";
import { useReceipts } from "@/hooks/useReceipts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";

const statusConfig = {
  approved: {
    variant: "success" as const,
    icon: CheckCircle,
    label: "Approved",
  },
  pending: {
    variant: "warning" as const,
    icon: Clock,
    label: "Pending",
  },
  rejected: {
    variant: "destructive" as const,
    icon: XCircle,
    label: "Rejected",
  },
};

const ExternalExpenses = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExternalExpense | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<ExternalExpense | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [expenseToReject, setExpenseToReject] = useState<ExternalExpense | null>(null);

  const { hasFinanceAccess, isAdmin } = useAuth();
  const { data: company } = useCompany();
  const { data: hasDelegatedAuthority } = useHasDelegatedAuthority();
  const { data: expenses, isLoading } = useExternalExpenses();
  const { data: stats, isLoading: statsLoading } = useExternalExpenseStats();
  const { data: receipts } = useReceipts();

  const currency = company?.currency || "INR";
  const canManage = isAdmin();
  const canApprove = hasFinanceAccess() || isAdmin() || hasDelegatedAuthority;

  const filteredExpenses = useMemo(() => {
    const list = expenses || [];
    return list.filter((expense) => {
      if (!searchQuery) return true;

      const normalizedQuery = searchQuery.toLowerCase();
      return (
        expense.description.toLowerCase().includes(normalizedQuery) ||
        expense.department?.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [expenses, searchQuery]);

  const sortedFilteredExpenses = useMemo(() => {
    if (!filteredExpenses || filteredExpenses.length === 0) return [];

    return [...filteredExpenses].sort((a, b) => {
      const dateA = new Date(a.expense_date).getTime();
      const dateB = new Date(b.expense_date).getTime();

      const safeDateA = Number.isNaN(dateA) ? 0 : dateA;
      const safeDateB = Number.isNaN(dateB) ? 0 : dateB;

      if (safeDateA !== safeDateB) {
        return safeDateB - safeDateA;
      }

      const createdA = new Date(a.created_at).getTime();
      const createdB = new Date(b.created_at).getTime();
      return (Number.isNaN(createdB) ? 0 : createdB) - (Number.isNaN(createdA) ? 0 : createdA);
    });
  }, [filteredExpenses]);

  const rejectExpense = useRejectExternalExpense();
  const deleteExpense = useDeleteExternalExpense();

  const handleCreate = () => {
    setSelectedExpense(null);
    setDialogOpen(true);
  };

  const handleEdit = (expense: ExternalExpense) => {
    setSelectedExpense(expense);
    setDialogOpen(true);
  };

  const handleDeleteClick = (expense: ExternalExpense) => {
    setExpenseToDelete(expense);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (expenseToDelete) {
      await deleteExpense.mutateAsync(expenseToDelete.id);
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
    }
  };

  const handleRejectClick = (expense: ExternalExpense) => {
    setExpenseToReject(expense);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async (reason: string) => {
    if (expenseToReject) {
      await rejectExpense.mutateAsync({ id: expenseToReject.id, notes: reason });
      setRejectDialogOpen(false);
      setExpenseToReject(null);
    }
  };

  const openReceiptInNewTab = async (fileUrl: string, fileName: string) => {
    try {
      const urlPattern = /storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/;
      const match = fileUrl.match(urlPattern);

      let finalUrl = fileUrl;

      if (match) {
        const bucketName = match[1];
        const filePath = decodeURIComponent(match[2]).split("?")[0];

        const { data, error } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(filePath, 3600);

        if (!error && data?.signedUrl) {
          finalUrl = data.signedUrl;
        }
      }

      window.open(finalUrl, "_blank");
    } catch (error) {
      console.error("Error opening receipt:", error);
      toast({
        title: "Error",
        description: "Failed to open receipt. Please try again.",
        variant: "destructive",
      });
    }
  };

  const downloadReceipt = async (fileUrl: string, fileName: string) => {
    try {
      const urlPattern = /storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/;
      const match = fileUrl.match(urlPattern);

      let finalUrl = fileUrl;

      if (match) {
        const bucketName = match[1];
        const filePath = decodeURIComponent(match[2]).split("?")[0];

        const { data, error } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(filePath, 3600);

        if (!error && data?.signedUrl) {
          finalUrl = data.signedUrl;
        }
      }

      const response = await fetch(finalUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch file");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName || "receipt";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.error("Error downloading receipt:", error);
      toast({
        title: "Error",
        description: "Failed to download receipt. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">External Expenses</h1>
            <p className="text-muted-foreground">Track and approve company external expenses</p>
          </div>
          {canManage && (
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Submit Expense
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card variant="stat" className="p-4">
          <p className="text-sm text-muted-foreground">Total Expenses</p>
          {statsLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-bold">{formatCurrency(stats?.totalAmount || 0, currency)}</p>
          )}
        </Card>
        <Card variant="stat" className="p-4">
          <p className="text-sm text-muted-foreground">Approved</p>
          {statsLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-bold text-success">
              {formatCurrency(stats?.approvedAmount || 0, currency, { compact: true })}
            </p>
          )}
        </Card>
        <Card variant="stat" className="p-4">
          <p className="text-sm text-muted-foreground">Pending Approval</p>
          {statsLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-bold text-warning">{formatCurrency(stats?.pendingAmount || 0, currency)}</p>
          )}
        </Card>
        <Card variant="stat" className="p-4">
          <p className="text-sm text-muted-foreground">Total Transactions</p>
          {statsLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-bold">{stats?.totalTransactions || 0} transactions</p>
          )}
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search expenses..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sortedFilteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-lg font-medium">No expenses found</p>
                    <p className="text-sm text-muted-foreground">
                      {canManage ? "Submit your first expense to get started" : "No external expenses available"}
                    </p>
                    {canManage && (
                      <Button className="mt-4" onClick={handleCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Submit Expense
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                sortedFilteredExpenses.map((expense) => {
                  const status = statusConfig[expense.status as keyof typeof statusConfig] || statusConfig.pending;
                  const StatusIcon = status.icon;

                  return (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{expense.description}</TableCell>
                      <TableCell>
                        {expense.expense_categories?.name ? (
                          <Badge variant="muted">{expense.expense_categories.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{expense.department || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage
                              src={
                                expense.profiles?.avatar_url ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${expense.profiles?.full_name || "Unknown"}`
                              }
                            />
                            <AvatarFallback>{(expense.profiles?.full_name || "U").charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{expense.profiles?.full_name || "Unknown"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">{formatCurrency(Number(expense.amount), currency)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {(() => {
                          const parsedDate = new Date(expense.expense_date);
                          return Number.isNaN(parsedDate.getTime()) ? "-" : format(parsedDate, "MMM d, yyyy");
                        })()}
                      </TableCell>
                      <TableCell>
                        {expense.receipt_id ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="success" className="gap-1">
                              <Receipt className="h-3 w-3" />
                              Attached
                            </Badge>
                            {(() => {
                              const receipt = receipts?.find((r) => r.id === expense.receipt_id);
                              if (!receipt?.file_url) return null;

                              return (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      openReceiptInNewTab(receipt.file_url, receipt.receipt_number || "Receipt");
                                    }}
                                    title="View receipt"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      downloadReceipt(receipt.file_url, receipt.receipt_number || "Receipt");
                                    }}
                                    title="Download receipt"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <Badge variant="muted">Missing</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={status.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ExternalExpenseActions
                          expense={expense}
                          canManage={canManage}
                          canApprove={canApprove}
                          onEdit={handleEdit}
                          onReject={handleRejectClick}
                          onDelete={handleDeleteClick}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ExternalExpenseDialog expense={selectedExpense} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RejectExpenseDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        expenseDescription={expenseToReject?.description || ""}
        expenseAmount={Number(expenseToReject?.amount) || 0}
        onConfirm={handleRejectConfirm}
        isLoading={rejectExpense.isPending}
      />
    </DashboardLayout>
  );
};

export default ExternalExpenses;
