import { CheckCircle, MoreHorizontal, Pencil, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApproveExternalExpense, ExternalExpense } from "@/hooks/useExternalExpenses";

interface ExternalExpenseActionsProps {
  expense: ExternalExpense;
  canManage: boolean;
  canApprove: boolean;
  onEdit: (expense: ExternalExpense) => void;
  onReject: (expense: ExternalExpense) => void;
  onDelete: (expense: ExternalExpense) => void;
}

export function ExternalExpenseActions({
  expense,
  canManage,
  canApprove,
  onEdit,
  onReject,
  onDelete,
}: ExternalExpenseActionsProps) {
  const approveExpense = useApproveExternalExpense();
  const isPending = expense.status === "pending";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        {canManage && (
          <DropdownMenuItem onClick={() => onEdit(expense)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {isPending && canApprove && (
          <>
            <DropdownMenuItem className="text-success" onClick={() => approveExpense.mutate(expense.id)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onReject(expense)}>
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => onDelete(expense)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
