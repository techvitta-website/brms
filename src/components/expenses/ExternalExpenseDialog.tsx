import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Receipt, Upload, X, File, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateExpenseCategory, useExpenseCategories } from "@/hooks/useExpenses";
import {
  ExternalExpense,
  useCreateExternalExpense,
  useUpdateExternalExpense,
} from "@/hooks/useExternalExpenses";
import { useReceipts } from "@/hooks/useReceipts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useReceiptOCR } from "@/hooks/useReceiptOCR";

interface ExternalExpenseDialogProps {
  expense?: ExternalExpense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const departments = [
  "Sales",
  "Marketing",
  "Engineering",
  "Design",
  "Operations",
  "HR",
  "Finance",
  "Legal",
];

export function ExternalExpenseDialog({ expense, open, onOpenChange }: ExternalExpenseDialogProps) {
  const isEditing = !!expense;
  const { user } = useAuth();
  const createExpense = useCreateExternalExpense();
  const updateExpense = useUpdateExternalExpense();
  const { data: categories } = useExpenseCategories();
  const createCategory = useCreateExpenseCategory();
  const { data: receipts } = useReceipts();
  const { extractReceiptData, isExtracting } = useReceiptOCR();

  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    expense_date: new Date().toISOString().split("T")[0],
    category_id: "",
    customCategory: "",
    department: "",
    notes: "",
    receipt_id: "",
  });

  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [receiptTab, setReceiptTab] = useState<"existing" | "upload">("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    url: string;
    name: string;
    type: string;
    preview?: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const availableReceipts = receipts?.filter(
    (r) => !r.linked_expense_id || r.linked_expense_id === expense?.id
  );

  useEffect(() => {
    if (!open) return;

    if (expense) {
      setFormData({
        description: expense.description,
        amount: String(expense.amount),
        expense_date: expense.expense_date,
        category_id: expense.category_id || "",
        customCategory: "",
        department: expense.department || "",
        notes: expense.notes || "",
        receipt_id: expense.receipt_id || "",
      });
      setReceiptTab(expense.receipt_id ? "existing" : "upload");
    } else {
      setFormData({
        description: "",
        amount: "",
        expense_date: new Date().toISOString().split("T")[0],
        category_id: "",
        customCategory: "",
        department: "",
        notes: "",
        receipt_id: "",
      });
      setReceiptTab("upload");
    }

    setUploadedFile(null);
  }, [open, expense]);

  useEffect(() => {
    const otherCategory = categories?.find((cat) => cat.name.toLowerCase() === "other");
    if (formData.category_id === otherCategory?.id) {
      setShowCustomCategoryInput(true);
    } else {
      setShowCustomCategoryInput(false);
      if (formData.customCategory) {
        setFormData((prev) => ({ ...prev, customCategory: "" }));
      }
    }
  }, [formData.category_id, formData.customCategory, categories]);

  const validateFile = (file: File): boolean => {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive",
      });
      return false;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image (JPEG, PNG, WebP) or PDF",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const uploadFile = async (file: File) => {
    if (!user || !validateFile(file)) return;

    setIsUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("receipts").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(filePath);

      let preview: string | undefined;
      if (file.type.startsWith("image/")) {
        preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      }

      setUploadedFile({
        url: urlData.publicUrl,
        name: file.name,
        type: file.type,
        preview,
      });

      if (file.type.startsWith("image/")) {
        const extracted = await extractReceiptData(urlData.publicUrl);
        if (extracted) {
          setFormData((prev) => ({
            ...prev,
            description: extracted.vendor
              ? `${extracted.vendor}${extracted.category ? ` - ${extracted.category}` : ""}`
              : prev.description,
            amount: extracted.amount ? String(extracted.amount) : prev.amount,
            expense_date: extracted.date || prev.expense_date,
          }));
        }
      }

      toast({ title: "Receipt uploaded", description: "Your receipt has been uploaded successfully" });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!formData.amount) {
      toast({
        title: "Missing required field",
        description: "Please fill in the Amount field",
        variant: "destructive",
      });
      return;
    }

    try {
      let receiptId = formData.receipt_id || null;
      let finalCategoryId = formData.category_id || null;

      const otherCategory = categories?.find((cat) => cat.name.toLowerCase() === "other");
      if (formData.category_id === otherCategory?.id && formData.customCategory?.trim()) {
        try {
          const newCategory = await createCategory.mutateAsync(formData.customCategory.trim());
          finalCategoryId = newCategory.id;
        } catch (error) {
          console.error("Failed to save custom category:", error);
        }
      }

      if (uploadedFile && !receiptId) {
        let companyId: string | null = null;
        if (isEditing && expense?.company_id) {
          companyId = expense.company_id;
        } else if (user?.id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .maybeSingle();
          companyId = profile?.company_id || null;
        }

        let receiptPrefix = "RCP";
        if (companyId) {
          const { data: company } = await supabase
            .from("companies")
            .select("receipt_prefix")
            .eq("id", companyId)
            .maybeSingle();
          receiptPrefix = (company as any)?.receipt_prefix || "RCP";
        }

        const receiptNumber = `${receiptPrefix}-${Date.now().toString().slice(-8)}`;

        const { data: newReceipt, error: receiptError } = await supabase
          .from("receipts")
          .insert({
            receipt_number: receiptNumber,
            vendor: formData.description.split(" - ")[0] || "Unknown",
            amount: Number(formData.amount),
            receipt_date: formData.expense_date,
            file_url: uploadedFile.url,
            status: "pending",
            created_by: user?.id,
          })
          .select()
          .single();

        if (receiptError) throw receiptError;
        receiptId = newReceipt.id;
      }

      const expenseData = {
        description: formData.description,
        amount: Number(formData.amount),
        expense_date: formData.expense_date,
        category_id: finalCategoryId,
        department: formData.department || null,
        notes: formData.notes || null,
        receipt_id: receiptId,
      };

      let createdExpenseId: string | null = null;

      if (isEditing && expense) {
        await updateExpense.mutateAsync({
          id: expense.id,
          expense: expenseData,
        });
        createdExpenseId = expense.id;
      } else {
        const result = await createExpense.mutateAsync(expenseData);
        createdExpenseId = result.expense.id;
      }

      if (receiptId && createdExpenseId) {
        await supabase.from("receipts").update({ linked_expense_id: createdExpenseId }).eq("id", receiptId);
      }

      onOpenChange(false);
    } catch (error: any) {
      console.error("Submit error:", error);
      toast({
        title: "Failed to submit external expense",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const isPending = createExpense.isPending || updateExpense.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit External Expense" : "Submit External Expense"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the expense details below" : "Fill in the details to submit a new external expense"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Receipt</Label>
            <Tabs value={receiptTab} onValueChange={(v) => setReceiptTab(v as "existing" | "upload")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload New</TabsTrigger>
                <TabsTrigger value="existing">Select Existing</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-3">
                {uploadedFile ? (
                  <div className="relative rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-6 w-6"
                      onClick={() => setUploadedFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-4">
                      {uploadedFile.preview ? (
                        <img src={uploadedFile.preview} alt="Receipt preview" className="h-16 w-16 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                          <File className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{uploadedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {uploadedFile.type?.includes("pdf") ? "PDF Document" : "Image"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-all",
                      isDragging
                        ? "border-primary bg-primary/10"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
                      (isUploading || isExtracting) && "pointer-events-none opacity-50"
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={handleDrop}
                  >
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf"
                      onChange={handleFileSelect}
                      disabled={isUploading || isExtracting}
                    />
                    {isUploading || isExtracting ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">
                          {isExtracting ? (
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-4 w-4" />
                              Extracting data...
                            </span>
                          ) : (
                            "Uploading..."
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="rounded-full bg-primary/10 p-2">
                          <Upload className="h-5 w-5 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm">
                            Drop receipt or <span className="text-primary font-medium">browse</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, PDF (max 10MB)</p>
                        </div>
                      </div>
                    )}
                  </label>
                )}
              </TabsContent>

              <TabsContent value="existing" className="mt-3">
                <Select
                  value={formData.receipt_id}
                  onValueChange={(value) => {
                    setFormData((prev) => ({ ...prev, receipt_id: value }));
                    setUploadedFile(null);

                    const selectedReceipt = availableReceipts?.find((r) => r.id === value);
                    if (selectedReceipt && !formData.description) {
                      setFormData((prev) => ({
                        ...prev,
                        receipt_id: value,
                        description: prev.description || selectedReceipt.vendor,
                        amount: prev.amount || String(selectedReceipt.amount),
                        expense_date: prev.expense_date || selectedReceipt.receipt_date,
                      }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a receipt" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReceipts?.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">No receipts available</div>
                    ) : (
                      availableReceipts?.map((receipt) => (
                        <SelectItem key={receipt.id} value={receipt.id}>
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-muted-foreground" />
                            <span>{receipt.vendor}</span>
                            <span className="text-muted-foreground">${Number(receipt.amount).toFixed(2)}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="What was this expense for?"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense_date">Date</Label>
              <Input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, expense_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories && categories.length > 0 ? (
                    categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="loading" disabled>
                      Loading categories...
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {showCustomCategoryInput && (
                <div className="mt-2">
                  <Label htmlFor="customCategory">Custom Category</Label>
                  <Input
                    id="customCategory"
                    placeholder="Enter custom category name"
                    value={formData.customCategory}
                    onChange={(e) => setFormData((prev) => ({ ...prev, customCategory: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Select
                value={formData.department}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, department: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional details about this expense"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || isUploading || isExtracting}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Update External Expense" : "Submit External Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
