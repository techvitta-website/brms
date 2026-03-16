import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import {
  FileSpreadsheet,
  ChevronLeft,
  Eye,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Upload,
  Link as LinkIcon,
  X,
  File,
  Filter,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { useBankStatements, useBankStatementTransactions, useUpdateBankStatementTransaction } from "@/hooks/useStatements";
import type { BankStatement, BankStatementTransaction } from "@/hooks/useStatements";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useExpenses } from "@/hooks/useExpenses";
import { useReceipts } from "@/hooks/useReceipts";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/hooks/useCategories";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { dedupeStatementTransactions, getTransactionDateFromMetadataOriginal, getValueDateFromMetadataOriginal } from "@/lib/statementTransactionDedup";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Transactions = () => {
  console.log('🚀 [Transactions] Component rendering');
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(-1);
  const [transactionStartRow, setTransactionStartRow] = useState<number>(-1);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [proofValues, setProofValues] = useState<Record<string, string>>({});
  const [uploadingProofs, setUploadingProofs] = useState<Record<string, boolean>>({});
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [currentTransactionId, setCurrentTransactionId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [proofToDelete, setProofToDelete] = useState<{ transactionId: string; proofUrl: string } | null>(null);
  const [deletingProof, setDeletingProof] = useState(false);
  const { data: statementsRaw, isLoading } = useBankStatements() as unknown as { data?: BankStatement[]; isLoading: boolean };
  const statements = statementsRaw ?? [];
  const { data: transactionsRaw, isLoading: transactionsLoading } = useBankStatementTransactions(selectedStatementId, { dedupe: true }) as unknown as { data?: BankStatementTransaction[]; isLoading: boolean };
  const transactions = transactionsRaw ?? [];
  const { data: company } = useCompany();
  const { data: allTransactionsRaw, isLoading: allTransactionsLoading } = useQuery({
    queryKey: ["bank-statement-transactions-all", company?.id, statements.map((s) => s.id).join(",")],
    queryFn: async () => {
      if (!company?.id || statements.length === 0) return [];

      const statementIds = statements.map((statement) => statement.id);
      const { data, error } = await supabase
        .from("bank_statement_transactions")
        .select("*")
        .in("statement_id", statementIds);

      if (error) throw error;
      return dedupeStatementTransactions((data || []) as BankStatementTransaction[]);
    },
    enabled: !!company?.id && statements.length > 0,
  });
  const allTransactions = allTransactionsRaw ?? [];
  const interStatementDedupedTransactions = useMemo(() => dedupeStatementTransactions(allTransactions), [allTransactions]);

  const activeTransactions = selectedStatementId ? transactions : interStatementDedupedTransactions;
  const { user, hasRole } = useAuth();
  const updateTransaction = useUpdateBankStatementTransaction();
  const { data: expenses } = useExpenses();
  const { data: receipts } = useReceipts();
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  
  // Check if user is auditor (read-only access)
  const isAuditor = hasRole("auditor");
  
  // Category delete state
  const [categoryDeleteDropdownOpen, setCategoryDeleteDropdownOpen] = useState(false);
  const [selectedCategoryForDelete, setSelectedCategoryForDelete] = useState<string | null>(null);
  const [categoryDeleteDialogOpen, setCategoryDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(null);
  const [newCategoryInputs, setNewCategoryInputs] = useState<Record<string, string>>({});
  const [showNewCategoryInput, setShowNewCategoryInput] = useState<Record<string, boolean>>({});
  const [notesValues, setNotesValues] = useState<Record<string, string>>({});
  const [unsavedCategoriesDialogOpen, setUnsavedCategoriesDialogOpen] = useState(false);
  const [pendingBackNavigation, setPendingBackNavigation] = useState(false);
  const [pendingNavigationPath, setPendingNavigationPath] = useState<string | null>(null);
  const navigationBlockedRef = useRef(false);
  
  // Filter states
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterModeOfPayment, setFilterModeOfPayment] = useState<string>("");
  const [filterTransactionType, setFilterTransactionType] = useState<string>(""); // "debit", "credit", or ""
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [transactionsViewMode, setTransactionsViewMode] = useState<"all" | "statement">("all");
  const employeeNameCacheRef = useRef<Set<string> | null>(null);

  // Handle file upload for proof
  const handleProofFileUpload = async (transactionId: string, file: File) => {
    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please log in to upload files",
        variant: "destructive",
      });
      return;
    }

    setUploadingProofs(prev => ({ ...prev, [transactionId]: true }));

    try {
      const fileExt = file.name.split(".").pop();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user.id}/transaction-proofs/${transactionId}/${Date.now()}_${sanitizedFileName}`;

      // Determine content type
      let contentType = file.type || 'application/octet-stream';
      if (fileExt === 'pdf') {
        contentType = 'application/pdf';
      } else if (['jpg', 'jpeg'].includes(fileExt || '')) {
        contentType = 'image/jpeg';
      } else if (fileExt === 'png') {
        contentType = 'image/png';
      }

      const { error: uploadError } = await supabase.storage
        .from("transaction_proofs")
        .upload(filePath, file, {
          contentType: contentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("transaction_proofs")
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get file URL after upload');
      }

      // Update proof value with the uploaded file URL
      setProofValues(prev => ({
        ...prev,
        [transactionId]: urlData.publicUrl
      }));

      // Save to database
      updateTransaction.mutate({
        transactionId,
        proof: urlData.publicUrl
      });

      toast({
        title: "File uploaded",
        description: "Proof file has been uploaded successfully",
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploadingProofs(prev => ({ ...prev, [transactionId]: false }));
    }
  };

  // Handle proof deletion
  const handleDeleteProof = async () => {
    if (!proofToDelete) return;

    const { transactionId, proofUrl } = proofToDelete;
    setDeletingProof(true);

    try {
      // Extract file path from URL
      // URL format: https://[project].supabase.co/storage/v1/object/public/transaction_proofs/[path]
      // or: https://[project].supabase.co/storage/v1/object/sign/transaction_proofs/[path]
      let filePath = '';
      
      if (proofUrl.includes('/transaction_proofs/')) {
        // Extract path after transaction_proofs/
        const pathMatch = proofUrl.match(/transaction_proofs\/(.+)$/);
        if (pathMatch) {
          filePath = pathMatch[1];
        }
      }

      // Delete file from storage if it's in our bucket
      if (filePath && proofUrl.includes('transaction_proofs')) {
        const { error: deleteError } = await supabase.storage
          .from("transaction_proofs")
          .remove([filePath]);

        if (deleteError) {
          console.warn("Failed to delete file from storage:", deleteError);
          // Continue with database update even if storage delete fails
        }
      }

      // Update database to remove proof
      updateTransaction.mutate({
        transactionId,
        proof: ""
      });

      // Update local state
      setProofValues(prev => ({
        ...prev,
        [transactionId]: ""
      }));

      setDeleteConfirmOpen(false);
      setProofToDelete(null);

      toast({
        title: "Proof deleted",
        description: "Proof has been removed successfully",
      });
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete proof",
        variant: "destructive",
      });
    } finally {
      setDeletingProof(false);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: company?.currency || "INR",
    }).format(amount);
  };

  const normalizeCategoryName = (category: string | null | undefined) =>
    String(category || "").trim().toLowerCase();

  const extractPayrollEmployeeName = (description: string | null | undefined) => {
    if (!description) return null;

    const parts = String(description)
      .split("/")
      .map((part) => part.trim());

    if (parts.length < 4) return null;

    const rawName = parts[2] || "";
    const normalizedName = rawName.replace(/\s+/g, " ").trim();
    return normalizedName || null;
  };

  const transactionLookupById = useMemo(() => {
    const lookup = new Map<string, BankStatementTransaction>();

    interStatementDedupedTransactions.forEach((txn) => {
      lookup.set(txn.id, txn);
    });
    transactions.forEach((txn) => {
      lookup.set(txn.id, txn);
    });

    return lookup;
  }, [interStatementDedupedTransactions, transactions]);

  const ensureEmployeeFromPayrollTransaction = useCallback(async (
    transaction: Pick<BankStatementTransaction, "id" | "description" | "category"> | null | undefined,
    categoryOverride?: string | null
  ) => {
    if (!transaction || !company?.id || isAuditor) return;

    const effectiveCategory = normalizeCategoryName(categoryOverride ?? transaction.category);
    if (effectiveCategory !== "payroll") return;

    const fullName = extractPayrollEmployeeName(transaction.description);
    if (!fullName) return;

    if (!employeeNameCacheRef.current) {
      const { data: existingEmployees, error } = await supabase
        .from("employees")
        .select("full_name")
        .eq("company_id", company.id);

      if (error) {
        console.warn("Failed to load employee cache from payroll transactions:", error);
        return;
      }

      employeeNameCacheRef.current = new Set(
        (existingEmployees || [])
          .map((employee) => String(employee.full_name || "").trim().toLowerCase())
          .filter(Boolean)
      );
    }

    const normalizedNameKey = fullName.toLowerCase();
    if (employeeNameCacheRef.current.has(normalizedNameKey)) return;

    const slug =
      fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 60) || "employee";
    const uniqueSuffix =
      transaction.id.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase() ||
      Date.now().toString().slice(-8);
    const email = `${slug}.${uniqueSuffix}@payroll-import.local`;

    const { error: insertError } = await supabase.from("employees").insert({
      company_id: company.id,
      full_name: fullName,
      email,
      department: "Payroll",
      status: "active",
    });

    if (insertError) {
      console.warn("Failed to insert employee from payroll transaction:", insertError);
      return;
    }

    employeeNameCacheRef.current.add(normalizedNameKey);
    queryClient.invalidateQueries({ queryKey: ["employees"] });
  }, [company?.id, isAuditor, queryClient]);

  useEffect(() => {
    employeeNameCacheRef.current = null;
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id || isAuditor || interStatementDedupedTransactions.length === 0) return;

    const payrollTransactions = interStatementDedupedTransactions.filter(
      (txn) => normalizeCategoryName(txn.category) === "payroll"
    );

    if (payrollTransactions.length === 0) return;

    void (async () => {
      for (const txn of payrollTransactions) {
        await ensureEmployeeFromPayrollTransaction(txn);
      }
    })();
  }, [company?.id, interStatementDedupedTransactions, isAuditor, ensureEmployeeFromPayrollTransaction]);

  // Check if there are any unsaved categories (memoized for stable reference)
  const hasUnsavedCategories = useMemo(() => {
    const result = Object.keys(newCategoryInputs).some(
      (transactionId) => 
        showNewCategoryInput[transactionId] && 
        newCategoryInputs[transactionId]?.trim()
    );
    console.log('[hasUnsavedCategories] Computed:', {
      result,
      newCategoryInputsCount: Object.keys(newCategoryInputs).length,
      newCategoryInputs,
      showNewCategoryInput
    });
    return result;
  }, [newCategoryInputs, showNewCategoryInput]);

  // Get all unsaved category transactions
  const getUnsavedCategoryTransactions = () => {
    return Object.keys(newCategoryInputs).filter(
      (transactionId) => 
        showNewCategoryInput[transactionId] && 
        newCategoryInputs[transactionId]?.trim()
    );
  };

  // Save all unsaved categories
  const saveAllUnsavedCategories = async () => {
    const unsavedTransactions = getUnsavedCategoryTransactions();
    console.log('[Save All] Unsaved transactions:', unsavedTransactions);
    
    if (unsavedTransactions.length === 0) {
      setUnsavedCategoriesDialogOpen(false);
      handleNavigationAfterSave();
      return;
    }

    // Save each unsaved category
    const savePromises = unsavedTransactions.map((transactionId) => {
      const categoryName = newCategoryInputs[transactionId]?.trim();
      if (!categoryName) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        createCategory.mutate(categoryName, {
          onSuccess: (newCategory) => {
            const finalCategoryName = (newCategory as any)?.category_name || categoryName.trim();
            updateTransaction.mutate({
              transactionId,
              category: finalCategoryName
            }, {
              onSuccess: () => {
                const matchingTransaction = transactionLookupById.get(transactionId);
                void ensureEmployeeFromPayrollTransaction(matchingTransaction, finalCategoryName);
                // Clear the input state
                setShowNewCategoryInput(prev => ({
                  ...prev,
                  [transactionId]: false
                }));
                setNewCategoryInputs(prev => {
                  const updated = { ...prev };
                  delete updated[transactionId];
                  return updated;
                });
                resolve();
              },
              onError: () => {
                resolve(); // Continue even if one fails
              }
            });
          },
          onError: () => {
            resolve(); // Continue even if one fails
          }
        });
      });
    });

    await Promise.all(savePromises);
    
    toast({
      title: "Categories saved",
      description: `Successfully saved ${unsavedTransactions.length} categor${unsavedTransactions.length === 1 ? 'y' : 'ies'}.`,
    });

    setUnsavedCategoriesDialogOpen(false);
    handleNavigationAfterSave();
  };

  // Handle navigation after saving or discarding
  const handleNavigationAfterSave = useCallback(() => {
    navigationBlockedRef.current = false;
    isNavigatingRef.current = true;
    
    if (pendingBackNavigation) {
      setPendingBackNavigation(false);
      setSelectedStatementId(null);
      isNavigatingRef.current = false;
    } else if (pendingNavigationPath && pendingNavigationPath !== location.pathname) {
      const path = pendingNavigationPath;
      setPendingNavigationPath(null);
      // Use setTimeout to ensure state updates are processed first
      setTimeout(() => {
        navigate(path);
        isNavigatingRef.current = false;
      }, 0);
    } else {
      setPendingNavigationPath(null);
      isNavigatingRef.current = false;
    }
  }, [pendingBackNavigation, pendingNavigationPath, location.pathname, navigate]);

  // Handle back button click
  const handleBackClick = () => {
    if (hasUnsavedCategories) {
      setPendingBackNavigation(true);
      setUnsavedCategoriesDialogOpen(true);
    } else {
      setSelectedStatementId(null);
    }
  };

  // Handle navigation away from page
  const handleNavigationAttempt = useCallback((targetPath: string) => {
    if (hasUnsavedCategories && selectedStatementId) {
      navigationBlockedRef.current = true;
      setPendingNavigationPath(targetPath);
      setUnsavedCategoriesDialogOpen(true);
      return false; // Block navigation
    }
    return true; // Allow navigation
  }, [selectedStatementId, hasUnsavedCategories]);

  // Intercept browser back/forward button and sidebar link clicks
  useEffect(() => {
    if (!selectedStatementId) {
      return;
    }

    // Listen for popstate (browser back/forward button)
    const handlePopState = (e: PopStateEvent) => {
      if (hasUnsavedCategories) {
        // Prevent navigation by pushing current state back
        window.history.pushState(null, '', location.pathname);
        setPendingNavigationPath(location.pathname);
        setUnsavedCategoriesDialogOpen(true);
      }
    };

    // Intercept ALL link clicks (including React Router Links)
    const handleLinkClick = (e: MouseEvent) => {
      if (!hasUnsavedCategories) return;
      
      // Find the closest link element
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement;
      
      if (link) {
        const href = link.getAttribute('href');
        // Only intercept internal navigation
        if (href && href.startsWith('/') && href !== location.pathname) {
          console.log('🛑 [Navigation Block] Intercepted link click:', href);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          // Show dialog
          setPendingNavigationPath(href);
          setUnsavedCategoriesDialogOpen(true);
          return false;
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    // Use capture phase to intercept early, before React Router handles it
    document.addEventListener('click', handleLinkClick, true);

    // Cleanup
    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [selectedStatementId, location.pathname, hasUnsavedCategories]);


  // Monitor location changes to intercept ALL navigation (including Link clicks from sidebar)
  const prevLocationRef = useRef(location.pathname);
  const isNavigatingRef = useRef(false);
  const locationChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize prevLocationRef on mount
  useEffect(() => {
    prevLocationRef.current = location.pathname;
    console.log('[Navigation Block] Initialized with path:', location.pathname);
  }, []);
  
  useEffect(() => {
    // This should ALWAYS log when effect runs
    console.log('🔵🔵🔵 [Navigation Block] ===== EFFECT RUNNING =====');
    console.log('🔵 [Navigation Block] State:', {
      selectedStatementId,
      currentPath: location.pathname,
      prevPath: prevLocationRef.current,
      hasUnsavedCategories,
      isNavigating: isNavigatingRef.current
    });
    
    // Force a log to verify effect is running
    if (selectedStatementId) {
      console.log('✅ [Navigation Block] selectedStatementId IS SET:', selectedStatementId);
    } else {
      console.log('❌ [Navigation Block] selectedStatementId IS NOT SET');
    }

    if (!selectedStatementId) {
      console.log('🔵 [Navigation Block] No selectedStatementId, skipping block logic');
      prevLocationRef.current = location.pathname;
      isNavigatingRef.current = false;
      if (locationChangeTimeoutRef.current) {
        clearTimeout(locationChangeTimeoutRef.current);
        locationChangeTimeoutRef.current = null;
      }
      return;
    }

    // Debug logging
    console.log('🔵 [Navigation Block] Location check:', {
      prevPath: prevLocationRef.current,
      currentPath: location.pathname,
      hasUnsavedCategories,
      isNavigating: isNavigatingRef.current,
      selectedStatementId,
      pathChanged: location.pathname !== prevLocationRef.current,
      shouldBlock: location.pathname !== prevLocationRef.current && hasUnsavedCategories && !isNavigatingRef.current
    });

    // If location changed and we have unsaved categories, block it
    if (location.pathname !== prevLocationRef.current && hasUnsavedCategories && !isNavigatingRef.current) {
      // Store the target path before reverting
      const targetPath = location.pathname;
      
      console.log('🛑 [Navigation Block] ⚠️ BLOCKING NAVIGATION ⚠️');
      console.log('🛑 [Navigation Block] Target path:', targetPath);
      console.log('🛑 [Navigation Block] Reverting to:', prevLocationRef.current);
      
      // Immediately revert to previous location
      isNavigatingRef.current = true;
      navigate(prevLocationRef.current, { replace: true });
      
      // Set the pending navigation path and show dialog
      setPendingNavigationPath(targetPath);
      setUnsavedCategoriesDialogOpen(true);
      
      // Reset the flag after a short delay to allow the revert to complete
      if (locationChangeTimeoutRef.current) {
        clearTimeout(locationChangeTimeoutRef.current);
      }
      locationChangeTimeoutRef.current = setTimeout(() => {
        isNavigatingRef.current = false;
        locationChangeTimeoutRef.current = null;
      }, 100);
    } else if (location.pathname === prevLocationRef.current) {
      isNavigatingRef.current = false;
      if (locationChangeTimeoutRef.current) {
        clearTimeout(locationChangeTimeoutRef.current);
        locationChangeTimeoutRef.current = null;
      }
      prevLocationRef.current = location.pathname;
    } else {
      // Location changed but no unsaved categories or already navigating
      console.log('[Navigation Block] Allowing navigation:', {
        reason: hasUnsavedCategories ? 'has unsaved but isNavigating=true' : 'no unsaved categories',
        targetPath: location.pathname
      });
      prevLocationRef.current = location.pathname;
      isNavigatingRef.current = false;
    }
  }, [location.pathname, selectedStatementId, navigate, hasUnsavedCategories]);

  // Extract mode of payment from description (text before first "/")
  const extractModeOfPayment = (description: string | null) => {
    if (!description) return "—";
    const parts = String(description).split("/");
    return parts[0]?.trim() || String(description);
  };

  // Extract unique mode of payment values from transactions
  const uniqueModeOfPayments = useMemo(() => {
    if (!activeTransactions || activeTransactions.length === 0) return [];
    
    const modes = new Set<string>();
    activeTransactions.forEach((txn: any) => {
      if (txn.description) {
        const mode = extractModeOfPayment(txn.description);
        // Only add non-empty, non-default values, and exclude "End of the Statement"
        if (mode && mode !== "—" && mode.toLowerCase() !== "end of the statement") {
          modes.add(mode);
        }
      }
    });
    
    // Convert to array and sort alphabetically
    return Array.from(modes).sort();
  }, [activeTransactions]);

  // Extract description from transaction (text after first "/")
  const extractDescription = (description: string | null) => {
    if (!description) return "—";
    const descStr = String(description);
    const firstSlashIndex = descStr.indexOf("/");
    if (firstSlashIndex === -1) return "—";
    return descStr.substring(firstSlashIndex + 1).trim() || "—";
  };

  // Extract transaction date from metadata in its original format (e.g., "14-May-2025")

  const getDisplayTransactionDate = (txn: any) => {
    return getTransactionDateFromMetadataOriginal(txn.metadata) ||
      (txn.transaction_date ? format(new Date(txn.transaction_date), "dd-MMM-yyyy") : "—");
  };

  const getDisplayValueDate = (txn: any) => {
    return getValueDateFromMetadataOriginal(txn.metadata) || "—";
  };

  // Extract transaction date from metadata and convert to YYYY-MM-DD format
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
  
  // Sort transactions by metadata.transaction_date in descending order (newest first)
  const sortedTransactions = useMemo(() => {
    if (!activeTransactions || activeTransactions.length === 0) return [];
    
    return [...activeTransactions].sort((a: any, b: any) => {
      // Get transaction date from metadata, fallback to transaction_date column
      const dateA = getTransactionDateFromMetadata(a.metadata) || a.transaction_date;
      const dateB = getTransactionDateFromMetadata(b.metadata) || b.transaction_date;
      
      // Parse dates
      const dateAValue = dateA ? new Date(dateA).getTime() : 0;
      const dateBValue = dateB ? new Date(dateB).getTime() : 0;
      
      // Sort in descending order (newest first)
      return dateBValue - dateAValue;
    });
  }, [activeTransactions]);
  
  // Helper to log transaction dates for debugging
  const logTransactionDates = (txn: any, index: number) => {
    if (index < 5) {
      const metadataDate = getTransactionDateFromMetadata(txn.metadata);
      console.log(`Transaction ${index}:`, {
        id: txn.id,
        transaction_date: txn.transaction_date,
        metadataDate,
        metadata: txn.metadata?.original_data?.["Transaction Date"]
      });
    }
  };

  // Find header row and transaction start row
  const findHeaderRow = (data: any[][]) => {
    // Skip summary rows - look for transaction-specific headers
    const summaryKeywords = ["opening balance", "closing balance", "total debit", "total credit"];
    
    for (let i = 0; i < Math.min(50, data.length); i++) {
      const row = data[i] as any[];
      if (!row || row.length === 0) continue;

      const rowText = row.map((cell) => String(cell || "").toLowerCase().trim()).join(" ");
      
      // Skip if this looks like a summary row
      const isSummaryRow = summaryKeywords.some(keyword => rowText.includes(keyword));
      if (isSummaryRow) continue;

      // Look for transaction header keywords
      const headerKeywords = [
        "transaction date",
        "value date",
        "date",
        "particulars",
        "description",
        "narration",
        "debit",
        "credit",
        "balance",
        "cheque",
        "reference",
        "ref",
      ];
      
      const keywordCount = headerKeywords.filter((keyword) => rowText.includes(keyword)).length;
      
      // Must have "particulars" or "description" or "narration" to be a transaction header row
      // This distinguishes it from summary rows which don't have these
      const hasParticulars = rowText.includes("particulars") || rowText.includes("description") || rowText.includes("narration");
      const hasDate = rowText.includes("transaction date") || rowText.includes("value date") || (rowText.includes("date") && keywordCount >= 3);
      
      // Require at least 3 keywords AND must have particulars/description/narration
      // This ensures we get the transaction header, not the summary header
      if (keywordCount >= 3 && hasParticulars) {
        console.log(`Found transaction header row at index ${i}:`, row);
        return i;
      }
      
      // Fallback: if we have date and enough keywords but no particulars, still consider it
      // but only if it's clearly a transaction row (has cheque, reference, etc.)
      if (hasDate && keywordCount >= 4 && (rowText.includes("cheque") || rowText.includes("reference") || rowText.includes("ref"))) {
        console.log(`Found transaction header row at index ${i} (fallback):`, row);
        return i;
      }
    }
    return -1;
  };

  // Load Excel file
  const loadExcelFile = async (fileUrl: string) => {
    try {
      setLoadingExcel(true);
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Get all data including empty cells
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, 
        defval: '',
        blankrows: false 
      }) as any[][];
      
      // Find the maximum number of columns
      const maxCols = Math.max(...jsonData.map(row => row.length), 0);
      
      // Pad all rows to have the same number of columns
      const paddedData = jsonData.map(row => {
        const paddedRow = [...row];
        while (paddedRow.length < maxCols) {
          paddedRow.push('');
        }
        return paddedRow;
      });
      
      setExcelData(paddedData);

      // Find header row
      const headerIdx = findHeaderRow(paddedData);
      setHeaderRowIndex(headerIdx);
      
      if (headerIdx >= 0) {
        // Get headers
        const headers = paddedData[headerIdx].map((h: any) => String(h || "").trim());
        console.log('Setting headers from row', headerIdx, ':', headers);
        
        // Verify this is the correct row by checking for Particulars
        const hasParticulars = headers.some(h => 
          String(h || "").toLowerCase().includes("particulars") ||
          String(h || "").toLowerCase().includes("description") ||
          String(h || "").toLowerCase().includes("narration")
        );
        
        if (!hasParticulars) {
          console.warn('WARNING: Header row does not contain Particulars/Description/Narration!');
          console.warn('This might be the wrong row. Looking for transaction header...');
          
          // Try to find the correct row manually
          for (let i = headerIdx + 1; i < Math.min(headerIdx + 10, paddedData.length); i++) {
            const testRow = paddedData[i];
            if (!testRow) continue;
            const testHeaders = testRow.map((h: any) => String(h || "").trim());
            const testHasParticulars = testHeaders.some(h => 
              String(h || "").toLowerCase().includes("particulars") ||
              String(h || "").toLowerCase().includes("description") ||
              String(h || "").toLowerCase().includes("narration")
            );
            if (testHasParticulars) {
              console.log('Found correct header row at index', i, ':', testHeaders);
              setExcelHeaders(testHeaders);
              setTransactionStartRow(i + 1);
              setHeaderRowIndex(i);
              return;
            }
          }
        }
        
        setExcelHeaders(headers);
        setTransactionStartRow(headerIdx + 1);
      } else {
        console.error('Header row not found!');
      }
    } catch (err) {
      console.error('Error loading Excel file:', err);
      setExcelData([]);
      setExcelHeaders([]);
      setHeaderRowIndex(-1);
      setTransactionStartRow(-1);
    } finally {
      setLoadingExcel(false);
    }
  };

  const selectedStatement = statements?.find((s) => s.id === selectedStatementId);

  // Load Excel when statement is selected
  useEffect(() => {
    if (selectedStatement?.file_url) {
      const fileExtension = selectedStatement.file_name.split('.').pop()?.toLowerCase() || '';
      if (['xlsx', 'xls', 'csv'].includes(fileExtension)) {
        loadExcelFile(selectedStatement.file_url);
      }
    } else {
      setExcelData([]);
      setExcelHeaders([]);
      setHeaderRowIndex(-1);
      setTransactionStartRow(-1);
    }
  }, [selectedStatementId, selectedStatement?.file_url]);

  // Initialize proof values and notes from transactions when they load
  useEffect(() => {
    if (activeTransactions && activeTransactions.length > 0) {
      const initialProofs: Record<string, string> = {};
      const initialNotes: Record<string, string> = {};
      activeTransactions.forEach((txn: any) => {
        // Read from proof column directly
        initialProofs[txn.id] = txn.proof || "";
        // Read from notes column
        initialNotes[txn.id] = txn.notes || "";
      });
      setProofValues(prev => ({
        ...prev,
        ...initialProofs
      }));
      setNotesValues(prev => ({
        ...prev,
        ...initialNotes
      }));
      console.log('Initialized proof and notes values for', activeTransactions.length, 'transactions');
    }
  }, [activeTransactions]);

  const filteredAllTransactions = useMemo(() => {
    let filtered = [...sortedTransactions];

    const normalizeDate = (date: string | Date | null): string | null => {
      if (!date) return null;
      const dateObj = typeof date === "string" ? new Date(date) : date;
      if (!dateObj || isNaN(dateObj.getTime())) return null;
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const day = String(dateObj.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (filterCategory) {
      filtered = filtered.filter((txn: any) => (txn.category || "") === filterCategory);
    }

    if (filterModeOfPayment) {
      filtered = filtered.filter((txn: any) => extractModeOfPayment(txn.description) === filterModeOfPayment);
    }

    if (filterTransactionType) {
      filtered = filtered.filter((txn: any) => (txn.transaction_type || "").toLowerCase() === filterTransactionType.toLowerCase());
    }

    if (filterStartDate || filterEndDate) {
      const normalizedStartDate = normalizeDate(filterStartDate);
      const normalizedEndDate = normalizeDate(filterEndDate);

      filtered = filtered.filter((txn: any) => {
        const dateToCompare = getTransactionDateFromMetadata(txn.metadata) || txn.transaction_date;
        const normalizedTxnDate = normalizeDate(dateToCompare);
        if (!normalizedTxnDate) return false;

        const meetsStartDate = !normalizedStartDate || normalizedTxnDate >= normalizedStartDate;
        const meetsEndDate = !normalizedEndDate || normalizedTxnDate <= normalizedEndDate;
        return meetsStartDate && meetsEndDate;
      });
    }

    const normalizeText = (value: unknown) =>
      String(value || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    const seenFingerprints = new Set<string>();
    const deduplicated = filtered.filter((txn: any) => {
      const fingerprint = [
        normalizeText(getDisplayTransactionDate(txn)),
        normalizeText(getDisplayValueDate(txn)),
        normalizeText(extractModeOfPayment(txn.description)),
        normalizeText(extractDescription(txn.description)),
        normalizeText(formatCurrency(txn.debit_amount)),
        normalizeText(formatCurrency(txn.credit_amount)),
        normalizeText(txn.transaction_type || "—"),
      ].join("|");

      if (seenFingerprints.has(fingerprint)) {
        return false;
      }

      seenFingerprints.add(fingerprint);
      return true;
    });

    return deduplicated;
  }, [
    sortedTransactions,
    filterCategory,
    filterModeOfPayment,
    filterTransactionType,
    filterStartDate,
    filterEndDate,
  ]);

  const deduplicatedDisplayRows = useMemo(() => {
    const normalizeText = (value: unknown) =>
      String(value || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    const uniqueRows = new Map<string, {
      id: string;
      txnDate: string;
      valueDate: string;
      modeOfPayment: string;
      description: string;
      debit: string;
      credit: string;
      category: string;
      type: string;
    }>();

    filteredAllTransactions.forEach((txn: any) => {
      const txnDate = getDisplayTransactionDate(txn);
      const valueDate = getDisplayValueDate(txn);
      const modeOfPayment = extractModeOfPayment(txn.description);
      const description = extractDescription(txn.description);
      const debit = formatCurrency(txn.debit_amount);
      const credit = formatCurrency(txn.credit_amount);
      const category = txn.category || "—";
      const type = txn.transaction_type || "—";

      const rowKey = [
        normalizeText(txnDate),
        normalizeText(valueDate),
        normalizeText(modeOfPayment),
        normalizeText(description),
        normalizeText(debit),
        normalizeText(credit),
        normalizeText(type),
      ].join("|");

      if (!uniqueRows.has(rowKey)) {
        uniqueRows.set(rowKey, {
          id: txn.id,
          txnDate,
          valueDate,
          modeOfPayment,
          description,
          debit,
          credit,
          category,
          type,
        });
      }
    });

    return Array.from(uniqueRows.values());
  }, [filteredAllTransactions, company?.currency]);

  // Debug: Log when deleteConfirmOpen changes
  useEffect(() => {
    console.log('deleteConfirmOpen state changed to:', deleteConfirmOpen);
  }, [deleteConfirmOpen]);

  // Component to calculate and display period from transactions (same logic as Statement.tsx)
  const StatementPeriod = ({ statementId }: { statementId: string }) => {
    const { data: statementTransactions } = useBankStatementTransactions(statementId, { dedupe: true });
    
    const period = useMemo(() => {
      if (!statementTransactions || statementTransactions.length === 0) {
        return null;
      }
      
      // Type assertion for transactions array
      const transactions = statementTransactions as any[];
      
      // Sort transactions by date to get first and last
      const sortedTransactions = [...transactions].sort((a: any, b: any) => {
        const dateA = getTransactionDateFromMetadata(a.metadata) || a.transaction_date;
        const dateB = getTransactionDateFromMetadata(b.metadata) || b.transaction_date;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });
      
      const firstTransaction = sortedTransactions[0];
      const lastTransaction = sortedTransactions[sortedTransactions.length - 1];
      
      // Get dates from metadata if available, otherwise use transaction_date
      const firstDate = getTransactionDateFromMetadata(firstTransaction.metadata) || firstTransaction.transaction_date;
      const lastDate = getTransactionDateFromMetadata(lastTransaction.metadata) || lastTransaction.transaction_date;
      
      if (firstDate && lastDate) {
        // Parse dates - they might be in YYYY-MM-DD format from metadata
        const firstDateObj = new Date(firstDate);
        const lastDateObj = new Date(lastDate);
        
        if (!isNaN(firstDateObj.getTime()) && !isNaN(lastDateObj.getTime())) {
          return `${format(firstDateObj, "MMM d, yyyy")} - ${format(lastDateObj, "MMM d, yyyy")}`;
        }
      }
      
      return null;
    }, [statementTransactions]);
    
    if (period) {
      return <div className="text-sm">{period}</div>;
    }
    
    return <span className="text-muted-foreground">—</span>;
  };

  // Debug: Log when we're about to render Transaction Details
  if (selectedStatementId && selectedStatement) {
    console.log('🎯 [Transactions] Rendering Transaction Details view for statement:', selectedStatementId);
    return (
      <DashboardLayout>
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={handleBackClick}
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
                      const sortedTransactions = [...transactions].sort((a, b) => {
                        const dateA = getTransactionDateFromMetadata(a.metadata) || a.transaction_date;
                        const dateB = getTransactionDateFromMetadata(b.metadata) || b.transaction_date;
                        return new Date(dateA).getTime() - new Date(dateB).getTime();
                      });
                      
                      const firstTransaction = sortedTransactions[0];
                      const lastTransaction = sortedTransactions[sortedTransactions.length - 1];
                      
                      // Get dates from metadata if available, otherwise use transaction_date
                      const firstDate = getTransactionDateFromMetadata(firstTransaction.metadata) || firstTransaction.transaction_date;
                      const lastDate = getTransactionDateFromMetadata(lastTransaction.metadata) || lastTransaction.transaction_date;
                      
                      if (firstDate && lastDate) {
                        // Parse dates - they might be in YYYY-MM-DD format from metadata
                        const firstDateObj = new Date(firstDate);
                        const lastDateObj = new Date(lastDate);
                        
                        if (!isNaN(firstDateObj.getTime()) && !isNaN(lastDateObj.getTime())) {
                          return `${format(firstDateObj, "MMM d, yyyy")} - ${format(lastDateObj, "MMM d, yyyy")}`;
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

        {/* Filter Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>
              Filter transactions by category, mode of payment, type, or date range
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {/* Category Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-category">Category</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={filterCategory || "all"} onValueChange={(value) => setFilterCategory(value === "all" ? "" : value)}>
                      <SelectTrigger id="filter-category">
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.category_id} value={cat.category_name}>
                            {cat.category_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!isAuditor && (
                    <>
                  {selectedCategoryForDelete ? (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        // Second click: open delete dialog
                        const selectedCategory = categories?.find(cat => cat.category_name === selectedCategoryForDelete);
                        if (selectedCategory) {
                          setCategoryToDelete({ id: selectedCategory.category_id, name: selectedCategory.category_name });
                          setCategoryDeleteDialogOpen(true);
                        }
                      }}
                      title={`Delete category: ${selectedCategoryForDelete}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <DropdownMenu open={categoryDeleteDropdownOpen} onOpenChange={setCategoryDeleteDropdownOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={(e) => {
                            e.preventDefault();
                            // First click: open dropdown
                            setCategoryDeleteDropdownOpen(true);
                          }}
                          title="Delete category"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            setCategoryDeleteDropdownOpen(false);
                          }}
                          className="text-muted-foreground"
                          disabled
                        >
                          Select a category to delete
                        </DropdownMenuItem>
                        {categories && categories.length > 0 ? (
                          categories.map((cat) => (
                            <DropdownMenuItem
                              key={cat.category_id}
                              onClick={(e) => {
                                e.preventDefault();
                                setSelectedCategoryForDelete(cat.category_name);
                                setCategoryDeleteDropdownOpen(false);
                              }}
                            >
                              {cat.category_name}
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem disabled className="text-muted-foreground">
                            No categories available
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                      )}
                    </>
                  )}
                </div>
                {selectedCategoryForDelete && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Selected: {selectedCategoryForDelete}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => {
                        setSelectedCategoryForDelete(null);
                        setCategoryToDelete(null);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Mode of Payment Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-mode">Mode of Payment</Label>
                <Select value={filterModeOfPayment || "all"} onValueChange={(value) => setFilterModeOfPayment(value === "all" ? "" : value)}>
                  <SelectTrigger id="filter-mode">
                    <SelectValue placeholder="All modes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modes</SelectItem>
                    {uniqueModeOfPayments.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Transaction Type Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-type">Type</Label>
                <Select value={filterTransactionType || "all"} onValueChange={(value) => setFilterTransactionType(value === "all" ? "" : value)}>
                  <SelectTrigger id="filter-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-start-date">Start Date</Label>
                <Input
                  id="filter-start-date"
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>

              {/* End Date Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-end-date">End Date</Label>
                <Input
                  id="filter-end-date"
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>
            </div>
            {(filterCategory || filterModeOfPayment || filterTransactionType || filterStartDate || filterEndDate) && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterCategory("");
                    setFilterModeOfPayment("");
                    setFilterTransactionType("");
                    setFilterStartDate("");
                    setFilterEndDate("");
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              {loadingExcel ? "Loading document..." : excelData.length > 0 
                ? `Showing transactions from the uploaded document` 
                : "No document data available"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loadingExcel ? (
              <div className="p-6 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                <span className="text-muted-foreground">Loading document...</span>
              </div>
            ) : headerRowIndex >= 0 && transactionStartRow >= 0 && excelData.length > 0 ? (
              <div className="overflow-x-auto">
                {(() => {
                  // Find Credit column index
                  const creditColIndex = excelHeaders.findIndex(h => 
                    String(h || "").toLowerCase().includes("credit")
                  );
                  
                  // Find particulars/description column for mode of payment
                  // Try multiple search strategies
                  let particularsColIndex = excelHeaders.findIndex(h => {
                    const headerLower = String(h || "").toLowerCase().trim();
                    return headerLower === "particulars" || headerLower.includes("particulars");
                  });
                  
                  // If not found, try other variations
                  if (particularsColIndex === -1) {
                    particularsColIndex = excelHeaders.findIndex(h => {
                      const headerLower = String(h || "").toLowerCase().trim();
                      return headerLower.includes("description") || 
                             headerLower.includes("narration") ||
                             headerLower === "particular" ||
                             headerLower === "desc" ||
                             headerLower === "details";
                    });
                  }
                  
                  // Debug logging
                  console.log('Excel Headers:', excelHeaders);
                  console.log('Particulars Column Index:', particularsColIndex);
                  if (particularsColIndex >= 0) {
                    console.log('Found Particulars column:', excelHeaders[particularsColIndex]);
                  } else {
                    console.warn('Particulars column not found! Available headers:', excelHeaders);
                  }
                  console.log('Credit Column Index:', creditColIndex);

                  // Build header row with Proof inserted after Credit and Particulars replaced with Mode of Payment
                  const buildHeaderRow = () => {
                    const headers: JSX.Element[] = [];
                    excelHeaders.forEach((header, idx) => {
                      const headerStr = String(header || "").trim().toLowerCase();
                      const isParticulars = idx === particularsColIndex && particularsColIndex >= 0;
                      
                      // Replace Particulars column header with "Mode of Payment"
                      if (isParticulars) {
                        headers.push(
                          <TableHead key={idx} className="border border-border p-2 text-left font-semibold min-w-[150px] bg-blue-50">
                            Mode of Payment
                          </TableHead>
                        );
                        // Insert Description column right after Mode of Payment
                        headers.push(
                          <TableHead key={`description-header`} className="border border-border p-2 text-left font-semibold min-w-[200px] bg-purple-50">
                            Description
                          </TableHead>
                        );
                        // Insert Category column right after Description
                        headers.push(
                          <TableHead key={`category-header`} className="border border-border p-2 text-left font-semibold min-w-[150px] bg-orange-50">
                            Category
                          </TableHead>
                        );
                      } else {
                        headers.push(
                          <TableHead key={idx} className="border border-border p-2 text-left font-semibold min-w-max whitespace-nowrap">
                            {header || `Column ${idx + 1}`}
                          </TableHead>
                        );
                      }
                      // Insert Proof column after Credit
                      if (idx === creditColIndex && creditColIndex >= 0) {
                        headers.push(
                          <TableHead key={`proof-header`} className="border border-border p-2 text-left font-semibold min-w-[100px] bg-green-50">
                            Proof
                          </TableHead>
                        );
                        // Insert Note column right after Proof
                        headers.push(
                          <TableHead key={`note-header`} className="border border-border p-2 text-left font-semibold min-w-[200px] bg-yellow-50">
                            Note
                          </TableHead>
                        );
                      }
                    });
                    return headers;
                  };

                  return (
                    <Table className="border-collapse">
                      <TableHeader>
                        <TableRow className="bg-muted">
                          {buildHeaderRow()}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          // Pre-filter transactions by date range and transaction type if filters are set
                          // Use Transaction Date from metadata column
                          // Use sortedTransactions instead of transactions to maintain descending order
                          let transactionsToCheck = sortedTransactions || [];
                          
                          // Apply date filter
                          if (filterStartDate || filterEndDate) {
                            // Debug: log first few transactions before filtering
                            if (transactions && transactions.length > 0) {
                              console.log('Before filtering - sample transactions:');
                              transactions.slice(0, 5).forEach((txn: any, idx: number) => {
                                logTransactionDates(txn, idx);
                              });
                            }
                            
                            // Normalize filter dates to YYYY-MM-DD format for comparison
                            // Use local date formatting to avoid timezone issues
                            const normalizeDate = (date: string | Date | null): string | null => {
                              if (!date) return null;
                              
                              let dateObj: Date | null = null;
                              
                              if (typeof date === 'string') {
                                // If already in YYYY-MM-DD format, return as is
                                if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                                  return date;
                                }
                                // Try to parse
                                dateObj = new Date(date);
                              } else if (date instanceof Date) {
                                dateObj = date;
                              }
                              
                              if (!dateObj || isNaN(dateObj.getTime())) {
                                return null;
                              }
                              
                              // Format as YYYY-MM-DD using local date components (not UTC)
                              // This avoids timezone conversion issues
                              const year = dateObj.getFullYear();
                              const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                              const day = String(dateObj.getDate()).padStart(2, '0');
                              return `${year}-${month}-${day}`;
                            };
                            
                            const normalizedStartDate = normalizeDate(filterStartDate);
                            const normalizedEndDate = normalizeDate(filterEndDate);
                            
                            transactionsToCheck = transactionsToCheck.filter((txn: any) => {
                              // Get transaction date from metadata
                              const txnDateStr = getTransactionDateFromMetadata(txn.metadata);
                              
                              // If no date found in metadata, fallback to transaction_date
                              let dateToCompare = txnDateStr || txn.transaction_date;
                              
                              if (!dateToCompare) {
                                // If we can't get a date and filters are set, exclude this transaction
                                return false;
                              }
                              
                              // Normalize the transaction date to YYYY-MM-DD format
                              const normalizedTxnDate = normalizeDate(dateToCompare);
                              
                              if (!normalizedTxnDate) {
                                return false;
                              }
                              
                              // Compare dates as strings (YYYY-MM-DD format)
                              // >= includes start date, <= includes end date
                              const meetsStartDate = !normalizedStartDate || normalizedTxnDate >= normalizedStartDate;
                              const meetsEndDate = !normalizedEndDate || normalizedTxnDate <= normalizedEndDate;
                              
                              const inDateRange = meetsStartDate && meetsEndDate;
                              
                              // Debug logging for first few transactions
                              if (transactionsToCheck.indexOf(txn) < 3) {
                                console.log('Date filter check:', {
                                  txnDate: dateToCompare,
                                  normalizedTxnDate,
                                  normalizedStartDate,
                                  normalizedEndDate,
                                  meetsStartDate,
                                  meetsEndDate,
                                  inDateRange
                                });
                              }
                              
                              return inDateRange;
                            });
                            
                            // Debug: log filtered transactions count and sample
                            console.log('Date filter applied:', {
                              filterStartDate,
                              filterEndDate,
                              totalTransactions: transactions?.length || 0,
                              transactionsInRange: transactionsToCheck.length
                            });
                            
                            if (transactionsToCheck.length > 0) {
                              console.log('Sample transactions in range:');
                              transactionsToCheck.slice(0, 5).forEach((txn: any, idx: number) => {
                                logTransactionDates(txn, idx);
                              });
                            }
                          }
                          
                          // Apply transaction type filter
                          if (filterTransactionType) {
                            transactionsToCheck = transactionsToCheck.filter((txn: any) => {
                              const transactionType = txn.transaction_type?.toLowerCase() || "";
                              const filterType = filterTransactionType.toLowerCase();
                              return transactionType === filterType;
                            });
                            
                            console.log('Transaction type filter applied:', {
                              filterType: filterTransactionType,
                              transactionsAfterTypeFilter: transactionsToCheck.length
                            });
                          }
                          
                          const seenStatementRowKeys = new Set<string>();
                          const seenRenderedStatementRowKeys = new Set<string>();

                          return excelData.slice(transactionStartRow)
                            .filter((row: any, rowIdx: number) => {
                            // Skip completely empty rows
                            const hasData = row.some((cell: any) => 
                              cell !== undefined && cell !== null && String(cell).trim() !== ""
                            );
                            if (!hasData) return false;

                            // Extract mode of payment from particulars for filtering
                            const particularsValue = particularsColIndex >= 0 ? row[particularsColIndex] : null;
                            const modeOfPayment = extractModeOfPayment(particularsValue);

                            // Match transaction for filtering
                            const dateColIndex = excelHeaders.findIndex(h => 
                              String(h || "").toLowerCase().includes("date") && 
                              !String(h || "").toLowerCase().includes("value")
                            );
                            const debitColIndex = excelHeaders.findIndex(h => 
                              String(h || "").toLowerCase().includes("debit")
                            );
                            const creditColIndexForMatch = excelHeaders.findIndex(h => 
                              String(h || "").toLowerCase().includes("credit")
                            );
                            
                            const rowDate = dateColIndex >= 0 ? row[dateColIndex] : null;
                            const rowDebit = debitColIndex >= 0 ? parseFloat(String(row[debitColIndex] || "").replace(/[^0-9.-]/g, "")) : 0;
                            const rowCredit = creditColIndexForMatch >= 0 ? parseFloat(String(row[creditColIndexForMatch] || "").replace(/[^0-9.-]/g, "")) : 0;
                            
                            // Now try to find a matching transaction from the filtered list
                            let matchingTransaction: any = null;
                            if (transactionsToCheck.length > 0) {
                              matchingTransaction = transactionsToCheck.find((txn: any) => {
                                try {
                                  const txnDate = new Date(txn.transaction_date).toISOString().split('T')[0];
                                  let rowDateStr = null;
                                  if (rowDate) {
                                    if (typeof rowDate === 'number') {
                                      const excelEpoch = new Date(1899, 11, 30);
                                      const date = new Date(excelEpoch.getTime() + rowDate * 86400000);
                                      rowDateStr = date.toISOString().split('T')[0];
                                    } else {
                                      rowDateStr = new Date(rowDate).toISOString().split('T')[0];
                                    }
                                  }
                                  const dateMatch = rowDateStr && txnDate === rowDateStr;
                                  const amountMatch = (rowDebit > 0 && Math.abs(txn.debit_amount - rowDebit) < 0.01) ||
                                                    (rowCredit > 0 && Math.abs(txn.credit_amount - rowCredit) < 0.01);
                                  return dateMatch && amountMatch;
                                } catch (e) {
                                  return false;
                                }
                              });
                              
                              // Fallback: match by row index if exact match fails
                              if (!matchingTransaction) {
                                const sortedTransactions = [...transactionsToCheck].sort((a, b) => 
                                  new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
                                );
                                const originalRowIdx = excelData.slice(transactionStartRow).indexOf(row);
                                if (originalRowIdx >= 0 && originalRowIdx < sortedTransactions.length) {
                                  matchingTransaction = sortedTransactions[originalRowIdx];
                                }
                              }
                            }
                            
                            // If date filter is set, we must have a matching transaction in the date range
                            if (filterStartDate || filterEndDate) {
                              // If no transactions in the date range, exclude this row
                              if (transactionsToCheck.length === 0) {
                                return false;
                              }
                              // If we have transactions in range but couldn't match this row to any of them, exclude it
                              if (!matchingTransaction) {
                                return false;
                              }
                            }

                            // Apply filters
                            // Category filter
                            if (filterCategory && matchingTransaction?.category !== filterCategory) {
                              return false;
                            }

                            // Mode of payment filter - exact match with transaction description
                            if (filterModeOfPayment) {
                              // Must have a matching transaction to check mode of payment
                              if (!matchingTransaction) {
                                return false;
                              }
                              // Extract mode of payment from transaction description
                              const transactionModeOfPayment = extractModeOfPayment(matchingTransaction.description);
                              // Compare filter value with extracted mode of payment (case-insensitive)
                              if (transactionModeOfPayment.toLowerCase() !== filterModeOfPayment.toLowerCase()) {
                                return false;
                              }
                            }

                            // Transaction type filter - compare with transaction_type field from database
                            if (filterTransactionType) {
                              // Must have a matching transaction to check transaction_type
                              if (!matchingTransaction) {
                                return false;
                              }
                              // Compare filter value with transaction_type field (case-insensitive)
                              const transactionType = matchingTransaction.transaction_type?.toLowerCase() || "";
                              const filterType = filterTransactionType.toLowerCase();
                              if (transactionType !== filterType) {
                                return false;
                              }
                            }

                            // Date range filter is already applied above by filtering transactionsToCheck
                            // If we have a matching transaction, it's already in the date range
                            // If we don't have a match but transactionsToCheck has items, the row might still match
                            // (handled by the check above)

                            return true;
                          })
                          .filter((row: any) => {
                            const normalizeCell = (value: unknown) =>
                              String(value ?? "")
                                .replace(/[\u200B-\u200D\uFEFF]/g, "")
                                .trim()
                                .replace(/\s+/g, " ")
                                .toLowerCase();

                            const rowKey = row.map((cell: any) => normalizeCell(cell)).join("|");

                            if (seenStatementRowKeys.has(rowKey)) {
                              return false;
                            }

                            seenStatementRowKeys.add(rowKey);
                            return true;
                          })
                          .map((row: any, filteredRowIdx: number) => {
                            // Get the original row index for matching
                            const originalRows = excelData.slice(transactionStartRow);
                            const rowIdx = originalRows.findIndex((r) => r === row);

                            // Skip completely empty rows (already filtered, but keep for safety)
                            const hasData = row.some((cell: any) => 
                              cell !== undefined && cell !== null && String(cell).trim() !== ""
                            );
                            if (!hasData) return null;

                            // Try to find matching transaction from database first
                            // Match by date and amount
                            const dateColIndex = excelHeaders.findIndex(h => 
                              String(h || "").toLowerCase().includes("date") && 
                              !String(h || "").toLowerCase().includes("value")
                            );
                            const debitColIndex = excelHeaders.findIndex(h => 
                              String(h || "").toLowerCase().includes("debit")
                            );
                            const creditColIndexForMatch = excelHeaders.findIndex(h => 
                              String(h || "").toLowerCase().includes("credit")
                            );
                            
                            // Extract row data for matching
                            const rowDate = dateColIndex >= 0 ? row[dateColIndex] : null;
                            const rowDebit = debitColIndex >= 0 ? parseFloat(String(row[debitColIndex] || "").replace(/[^0-9.-]/g, "")) : 0;
                            const rowCredit = creditColIndexForMatch >= 0 ? parseFloat(String(row[creditColIndexForMatch] || "").replace(/[^0-9.-]/g, "")) : 0;
                            
                            // Use the pre-filtered transactionsToCheck for matching
                            let matchingTransaction: any = null;
                            if (transactionsToCheck.length > 0) {
                              // Try to match transaction - use row index as fallback if exact match fails
                              // First try exact match by date and amount
                              matchingTransaction = transactionsToCheck.find((txn: any) => {
                              try {
                                const txnDate = new Date(txn.transaction_date).toISOString().split('T')[0];
                                let rowDateStr = null;
                                if (rowDate) {
                                  // Handle Excel date serial numbers
                                  if (typeof rowDate === 'number') {
                                    const excelEpoch = new Date(1899, 11, 30);
                                    const date = new Date(excelEpoch.getTime() + rowDate * 86400000);
                                    rowDateStr = date.toISOString().split('T')[0];
                                  } else {
                                    rowDateStr = new Date(rowDate).toISOString().split('T')[0];
                                  }
                                }
                                const dateMatch = rowDateStr && txnDate === rowDateStr;
                                const amountMatch = (rowDebit > 0 && Math.abs(txn.debit_amount - rowDebit) < 0.01) ||
                                                  (rowCredit > 0 && Math.abs(txn.credit_amount - rowCredit) < 0.01);
                                return dateMatch && amountMatch;
                              } catch (e) {
                                return false;
                              }
                              });
                              
                              // Fallback: match by row index if we have transactions in order
                              if (!matchingTransaction && transactionsToCheck.length > rowIdx) {
                                // Try to match by position in the list (assuming transactions are in the same order)
                                const sortedTransactions = [...transactionsToCheck].sort((a, b) => 
                                  new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
                                );
                                if (rowIdx < sortedTransactions.length) {
                                  matchingTransaction = sortedTransactions[rowIdx];
                                }
                              }
                            }

                          const transactionId = matchingTransaction?.id;
                          const currentProof = transactionId ? (proofValues[transactionId] || "") : "";
                          const currentNote = transactionId
                            ? (notesValues[transactionId] ?? matchingTransaction?.notes ?? "")
                            : "";
                          
                          // Extract mode of payment from particulars
                          // Use transaction description if available, otherwise use Excel cell
                          const particularsValue = matchingTransaction?.description 
                            ? matchingTransaction.description 
                            : (particularsColIndex >= 0 ? row[particularsColIndex] : null);
                          const modeOfPayment = extractModeOfPayment(particularsValue);
                          
                          // Get description directly from the transaction's description field
                          // Extract everything after the first '/' from the description
                          const transactionDescription = matchingTransaction?.description || null;
                          const extractedDescription = extractDescription(transactionDescription);
                          
                          // Debug: Log first few rows to verify matching
                          if (rowIdx < 3 && transactionsToCheck && transactionsToCheck.length > 0) {
                            const matchedDate = matchingTransaction ? getTransactionDateFromMetadata(matchingTransaction.metadata) || matchingTransaction.transaction_date : null;
                            console.log(`Row ${rowIdx} matching:`, {
                              hasTransaction: !!matchingTransaction,
                              transactionId,
                              transactionsAvailable: transactionsToCheck.length,
                              totalTransactions: transactions?.length || 0,
                              matchedTransactionDate: matchedDate,
                              rowDate: dateColIndex >= 0 ? row[dateColIndex] : null,
                              rowDebit,
                              rowCredit,
                              filterStartDate,
                              filterEndDate
                            });
                          }
                          
                          // Debug logging
                          if (rowIdx < 3) {
                            console.log(`Row ${rowIdx}:`, {
                              transactionId,
                              hasTransaction: !!matchingTransaction,
                              currentProof,
                              transactionsCount: transactionsToCheck?.length || 0,
                              totalTransactionsCount: transactions?.length || 0
                            });
                          }

                          const canonicalize = (value: unknown) =>
                            String(value ?? "")
                              .normalize('NFKD')
                              .replace(/[\u200B-\u200D\uFEFF]/g, "")
                              .toLowerCase()
                              .replace(/[^a-z0-9]/g, "");

                          const renderedRowKey = [
                            ...row.map((cell: any) => canonicalize(cell)),
                            canonicalize(modeOfPayment),
                            canonicalize(extractedDescription),
                            canonicalize(matchingTransaction?.transaction_type || ""),
                            canonicalize(formatCurrency(matchingTransaction?.debit_amount ?? rowDebit ?? null)),
                            canonicalize(formatCurrency(matchingTransaction?.credit_amount ?? rowCredit ?? null)),
                            canonicalize(currentProof),
                            canonicalize(currentNote),
                          ].join("|");

                          if (seenRenderedStatementRowKeys.has(renderedRowKey)) {
                            return null;
                          }

                          seenRenderedStatementRowKeys.add(renderedRowKey);

                          // Build data row with Proof inserted after Credit and Particulars replaced with Mode of Payment
                          const cells: JSX.Element[] = [];
                          
                          // Helper function to get transaction value for a column
                          const getTransactionValueForColumn = (headerName: string): any => {
                            if (!matchingTransaction) return null;
                            
                            const headerLower = String(headerName || "").toLowerCase().trim();
                            
                            // Map Excel headers to transaction fields
                            // Prioritize "transaction date" explicitly - check multiple variations
                            if (headerLower.includes("transaction date") || 
                                headerLower === "transaction date" ||
                                (headerLower.includes("transaction") && headerLower.includes("date"))) {
                              return matchingTransaction.transaction_date ? format(new Date(matchingTransaction.transaction_date), "dd-MMM-yyyy") : null;
                            }
                            // Check for "value date" explicitly - extract from metadata
                            if (headerLower.includes("value date") || 
                                headerLower === "value date" ||
                                (headerLower.includes("value") && headerLower.includes("date"))) {
                              // Extract Value Date from metadata column in its original format
                              const metadataValueDate = getValueDateFromMetadataOriginal(matchingTransaction.metadata);
                              // Use metadata date if available (already in original format like "14-May-2025")
                              if (metadataValueDate) {
                                return metadataValueDate;
                              } else if (matchingTransaction.value_date) {
                                // Fallback to value_date if metadata doesn't have date
                                return format(new Date(matchingTransaction.value_date), "dd-MMM-yyyy");
                              } else {
                                return null;
                              }
                            }
                            // Fallback: if header is just "date" (and we haven't matched value date above)
                            // Check if this is the first date column by checking the column index
                            // We'll assume the first date column is transaction date
                            if (headerLower === "date" || (headerLower.includes("date") && !headerLower.includes("value"))) {
                              // Use transaction_date for any date column that's not value date
                              return matchingTransaction.transaction_date ? format(new Date(matchingTransaction.transaction_date), "dd-MMM-yyyy") : null;
                            }
                            if (headerLower.includes("debit")) {
                              return matchingTransaction.debit_amount !== null && matchingTransaction.debit_amount !== undefined 
                                ? formatCurrency(matchingTransaction.debit_amount) 
                                : null;
                            }
                            if (headerLower.includes("credit")) {
                              return matchingTransaction.credit_amount !== null && matchingTransaction.credit_amount !== undefined 
                                ? formatCurrency(matchingTransaction.credit_amount) 
                                : null;
                            }
                            if (headerLower.includes("balance")) {
                              return matchingTransaction.balance !== null && matchingTransaction.balance !== undefined 
                                ? formatCurrency(matchingTransaction.balance) 
                                : null;
                            }
                            if (headerLower.includes("reference") || headerLower.includes("ref")) {
                              return matchingTransaction.reference_number || null;
                            }
                            if (headerLower.includes("cheque")) {
                              return matchingTransaction.reference_number || null;
                            }
                            
                            return null;
                          };
                          
                          row.forEach((cell: any, cellIdx: number) => {
                            // Replace Particulars column value with extracted Mode of Payment
                            const isParticularsColumn = cellIdx === particularsColIndex && particularsColIndex >= 0;
                            
                            if (isParticularsColumn) {
                              cells.push(
                                <TableCell 
                                  key={cellIdx} 
                                  className="border border-border p-2 text-xs align-top break-words bg-blue-50/30"
                                >
                                  <div className="font-medium">{modeOfPayment}</div>
                                </TableCell>
                              );
                              // Insert Description column right after Mode of Payment
                              cells.push(
                                <TableCell 
                                  key={`description-${cellIdx}`} 
                                  className="border border-border p-2 text-xs align-top break-words bg-purple-50/30"
                                >
                                  <div className="break-words">{extractedDescription}</div>
                                </TableCell>
                              );
                              // Insert Category column right after Description
                              cells.push(
                                <TableCell 
                                  key={`category-${cellIdx}`} 
                                  className="border border-border p-2 text-xs align-top break-words bg-orange-50/30"
                                >
                                  {transactionId ? (
                                    <div className="min-w-[120px]">
                                      {isAuditor ? (
                                        // Read-only display for auditors
                                        <div className="text-xs text-muted-foreground">
                                          {matchingTransaction?.category || "—"}
                                        </div>
                                      ) : showNewCategoryInput[transactionId] ? (
                                        <div className="flex gap-1">
                                          <Input
                                            value={newCategoryInputs[transactionId] || ""}
                                            onChange={(e) => {
                                              setNewCategoryInputs(prev => ({
                                                ...prev,
                                                [transactionId]: e.target.value
                                              }));
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                const categoryName = newCategoryInputs[transactionId]?.trim();
                                                if (categoryName) {
                                                  createCategory.mutate(categoryName, {
                                                    onSuccess: (newCategory) => {
                                                      const finalCategoryName = (newCategory as any)?.category_name || categoryName.trim();
                                                      updateTransaction.mutate({
                                                        transactionId,
                                                        category: finalCategoryName
                                                      }, {
                                                        onSuccess: () => {
                                                          void ensureEmployeeFromPayrollTransaction(matchingTransaction, finalCategoryName);
                                                        }
                                                      });
                                                      setShowNewCategoryInput(prev => ({
                                                        ...prev,
                                                        [transactionId]: false
                                                      }));
                                                      setNewCategoryInputs(prev => {
                                                        const updated = { ...prev };
                                                        delete updated[transactionId];
                                                        return updated;
                                                      });
                                                    }
                                                  });
                                                }
                                              } else if (e.key === 'Escape') {
                                                setShowNewCategoryInput(prev => ({
                                                  ...prev,
                                                  [transactionId]: false
                                                }));
                                                setNewCategoryInputs(prev => {
                                                  const updated = { ...prev };
                                                  delete updated[transactionId];
                                                  return updated;
                                                });
                                              }
                                            }}
                                            placeholder="Enter category name"
                                            className="h-7 text-xs"
                                            autoFocus
                                          />
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => {
                                              setShowNewCategoryInput(prev => ({
                                                ...prev,
                                                [transactionId]: false
                                              }));
                                              setNewCategoryInputs(prev => {
                                                const updated = { ...prev };
                                                delete updated[transactionId];
                                                return updated;
                                              });
                                            }}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <Select
                                          value={matchingTransaction?.category || ""}
                                          onValueChange={(value) => {
                                            if (value === "other") {
                                              setShowNewCategoryInput(prev => ({
                                                ...prev,
                                                [transactionId]: true
                                              }));
                                            } else {
                                              updateTransaction.mutate({
                                                transactionId,
                                                category: value || null
                                              }, {
                                                onSuccess: () => {
                                                  void ensureEmployeeFromPayrollTransaction(matchingTransaction, value || null);
                                                }
                                              });
                                            }
                                          }}
                                        >
                                          <SelectTrigger className="h-7 text-xs">
                                            <SelectValue placeholder="Select category" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {categories?.map((cat) => (
                                              <SelectItem key={cat.category_id} value={cat.category_name}>
                                                {cat.category_name}
                                              </SelectItem>
                                            ))}
                                            <SelectItem value="other">Other</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                              );
                            } else {
                              // For other columns, use transaction data if available, otherwise use Excel cell data
                              const headerName = excelHeaders[cellIdx] || "";
                              
                              // Find Value Date column index
                              const valueDateColIndex = excelHeaders.findIndex(h => 
                                String(h || "").toLowerCase().includes("value date")
                              );
                              
                              // Special handling for Transaction Date column - always use transaction data if available
                              // Check if this is the Transaction Date column by comparing with dateColIndex
                              const isTransactionDateColumn = cellIdx === dateColIndex && dateColIndex >= 0;
                              // Special handling for Value Date column - always use transaction data if available
                              const isValueDateColumn = cellIdx === valueDateColIndex && valueDateColIndex >= 0;
                              
                              let transactionValue = null;
                              if (matchingTransaction) {
                                if (isTransactionDateColumn) {
                                  // Extract Transaction Date from metadata column in its original format
                                  const metadataDate = getTransactionDateFromMetadataOriginal(matchingTransaction.metadata);
                                  // Use metadata date if available (already in original format like "14-May-2025")
                                  if (metadataDate) {
                                    transactionValue = metadataDate;
                                  } else if (matchingTransaction.transaction_date) {
                                    // Fallback to transaction_date if metadata doesn't have date
                                    transactionValue = format(new Date(matchingTransaction.transaction_date), "dd-MMM-yyyy");
                                  } else {
                                    transactionValue = null;
                                  }
                                } else if (isValueDateColumn) {
                                  // Extract Value Date from metadata column in its original format
                                  const metadataValueDate = getValueDateFromMetadataOriginal(matchingTransaction.metadata);
                                  // Use metadata date if available (already in original format like "14-May-2025")
                                  if (metadataValueDate) {
                                    transactionValue = metadataValueDate;
                                  } else if (matchingTransaction.value_date) {
                                    // Fallback to value_date if metadata doesn't have date
                                    transactionValue = format(new Date(matchingTransaction.value_date), "dd-MMM-yyyy");
                                  } else {
                                    transactionValue = null;
                                  }
                                } else {
                                  // Use helper function for other columns
                                  transactionValue = getTransactionValueForColumn(headerName);
                                }
                              }
                              
                              // Always prefer transaction data when available
                              const displayValue = transactionValue !== null ? transactionValue : (cell !== undefined && cell !== null ? String(cell) : '—');
                              
                              cells.push(
                                <TableCell 
                                  key={cellIdx} 
                                  className="border border-border p-2 text-xs align-top break-words"
                                >
                                  {displayValue}
                                </TableCell>
                              );
                            }
                            // Insert Proof column after Credit
                            if (cellIdx === creditColIndex && creditColIndex >= 0) {
                              cells.push(
                                <TableCell key={`proof-${rowIdx}`} className="border border-border p-2 text-xs align-top break-words bg-green-50/30">
                                  {transactionId ? (
                                    <div className="space-y-1 min-w-[200px]">
                                      {currentProof ? (
                                        <div className="flex items-center gap-2 mb-1">
                                          {currentProof.startsWith('http') || currentProof.startsWith('/') ? (
                                            <a
                                              href={currentProof}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs underline truncate"
                                            >
                                              <LinkIcon className="h-3 w-3" />
                                              <span className="truncate max-w-[150px]">View Proof</span>
                                            </a>
                                          ) : (
                                            <a
                                              href={currentProof}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs underline truncate"
                                            >
                                              <File className="h-3 w-3" />
                                              <span className="truncate max-w-[150px]">View File</span>
                                            </a>
                                          )}
                                          {!isAuditor && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              console.log('Delete button clicked for transaction:', transactionId);
                                              setProofToDelete({ transactionId, proofUrl: currentProof });
                                              setDeleteConfirmOpen(true);
                                              console.log('Delete confirm dialog should open');
                                            }}
                                            title="Delete proof"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                          )}
                                        </div>
                                      ) : null}
                                      {isAuditor ? (
                                        // Read-only display for auditors
                                        <div className="text-xs text-muted-foreground">
                                          {currentProof ? (
                                            <a
                                              href={currentProof}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800 underline"
                                            >
                                              View Proof
                                            </a>
                                          ) : (
                                            "—"
                                          )}
                                        </div>
                                      ) : (
                                      <div className="flex gap-1">
                                        <Input
                                          value={currentProof}
                                          onChange={(e) => {
                                            const newValue = e.target.value;
                                            setProofValues(prev => ({
                                              ...prev,
                                              [transactionId]: newValue
                                            }));
                                          }}
                                          onBlur={(e) => {
                                            if (transactionId) {
                                              const proofValue = e.target.value.trim();
                                              // Save even if empty to clear existing proof
                                              updateTransaction.mutate({
                                                transactionId,
                                                proof: proofValue
                                              });
                                            }
                                          }}
                                          placeholder="Enter URL or upload file"
                                          className="h-8 text-xs flex-1"
                                        />
                                        <input
                                          type="file"
                                          id={`proof-file-${transactionId}`}
                                          className="hidden"
                                          accept="image/*,application/pdf"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file && transactionId) {
                                              handleProofFileUpload(transactionId, file);
                                            }
                                            // Reset input
                                            e.target.value = '';
                                          }}
                                        />
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon"
                                              className="h-8 w-8"
                                              disabled={uploadingProofs[transactionId]}
                                              title="Add proof"
                                            >
                                              {uploadingProofs[transactionId] ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : (
                                                <Plus className="h-3 w-3" />
                                              )}
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                              onClick={() => {
                                                document.getElementById(`proof-file-${transactionId}`)?.click();
                                              }}
                                            >
                                              <Upload className="h-4 w-4 mr-2" />
                                              Upload a file
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={() => {
                                                setCurrentTransactionId(transactionId);
                                                setLinkDialogOpen(true);
                                              }}
                                            >
                                              <LinkIcon className="h-4 w-4 mr-2" />
                                              Link from invoice or expense
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                      )}
                                    </div>
                                  ) : transactions && transactions.length > 0 ? (
                                    // Show editable field even if no exact match - use row index as fallback
                                    (() => {
                                      // Try to get transaction by row index as fallback
                                      const sortedTransactions = [...transactions].sort((a, b) => 
                                        new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
                                      );
                                      const fallbackTransaction = rowIdx >= 0 && rowIdx < sortedTransactions.length 
                                        ? sortedTransactions[rowIdx] 
                                        : null;
                                      const fallbackTransactionId = fallbackTransaction?.id;
                                      const fallbackProof = fallbackTransactionId ? (proofValues[fallbackTransactionId] || "") : "";
                                      
                                      if (fallbackTransactionId) {
                                        return isAuditor ? (
                                          // Read-only display for auditors
                                          <div className="text-xs text-muted-foreground">
                                            {fallbackProof ? (
                                              <a
                                                href={fallbackProof}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 underline"
                                              >
                                                View Proof
                                              </a>
                                            ) : (
                                              "—"
                                            )}
                                          </div>
                                        ) : (
                                          <div className="space-y-1 min-w-[200px]">
                                            {fallbackProof ? (
                                              <div className="flex items-center gap-2 mb-1">
                                                {fallbackProof.startsWith('http') || fallbackProof.startsWith('/') ? (
                                                  <a
                                                    href={fallbackProof}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs underline truncate"
                                                  >
                                                    <LinkIcon className="h-3 w-3" />
                                                    <span className="truncate max-w-[150px]">View Proof</span>
                                                  </a>
                                                ) : (
                                                  <a
                                                    href={fallbackProof}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs underline truncate"
                                                  >
                                                    <File className="h-3 w-3" />
                                                    <span className="truncate max-w-[150px]">View File</span>
                                                  </a>
                                                )}
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-5 w-5 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    console.log('Delete button clicked for fallback transaction:', fallbackTransactionId);
                                                    setProofToDelete({ transactionId: fallbackTransactionId, proofUrl: fallbackProof });
                                                    setDeleteConfirmOpen(true);
                                                    console.log('Delete confirm dialog should open');
                                                  }}
                                                  title="Delete proof"
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            ) : null}
                                            <div className="flex gap-1">
                                              <Input
                                                value={fallbackProof}
                                                onChange={(e) => {
                                                  const newValue = e.target.value;
                                                  setProofValues(prev => ({
                                                    ...prev,
                                                    [fallbackTransactionId]: newValue
                                                  }));
                                                }}
                                                onBlur={(e) => {
                                                  if (fallbackTransactionId) {
                                                    const proofValue = e.target.value.trim();
                                                    updateTransaction.mutate({
                                                      transactionId: fallbackTransactionId,
                                                      proof: proofValue
                                                    });
                                                  }
                                                }}
                                                placeholder="Enter URL or upload file"
                                                className="h-8 text-xs flex-1"
                                              />
                                              <input
                                                type="file"
                                                id={`proof-file-${fallbackTransactionId}`}
                                                className="hidden"
                                                accept="image/*,application/pdf"
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file && fallbackTransactionId) {
                                                    handleProofFileUpload(fallbackTransactionId, file);
                                                  }
                                                  e.target.value = '';
                                                }}
                                              />
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    disabled={uploadingProofs[fallbackTransactionId]}
                                                    title="Add proof"
                                                  >
                                                    {uploadingProofs[fallbackTransactionId] ? (
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                      <Plus className="h-3 w-3" />
                                                    )}
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                  <DropdownMenuItem
                                                    onClick={() => {
                                                      document.getElementById(`proof-file-${fallbackTransactionId}`)?.click();
                                                    }}
                                                  >
                                                    <Upload className="h-4 w-4 mr-2" />
                                                    Upload a file
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onClick={() => {
                                                      setCurrentTransactionId(fallbackTransactionId);
                                                      setLinkDialogOpen(true);
                                                    }}
                                                  >
                                                    <LinkIcon className="h-4 w-4 mr-2" />
                                                    Link from invoice or expense
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="text-muted-foreground text-xs italic">
                                          No transaction match
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                              );
                              // Insert Note column right after Proof
                              cells.push(
                                <TableCell key={`note-${rowIdx}`} className="border border-border p-2 text-xs align-top bg-yellow-50/30 min-w-[200px]">
                                  {transactionId ? (
                                    isAuditor ? (
                                      // Read-only display for auditors
                                      <div className="text-xs whitespace-pre-wrap break-words min-h-[60px]">
                                        {notesValues[transactionId] || "—"}
                                      </div>
                                    ) : (
                                    <Textarea
                                      value={notesValues[transactionId] || ""}
                                      onChange={(e) => {
                                        const newValue = e.target.value;
                                        setNotesValues(prev => ({
                                          ...prev,
                                          [transactionId]: newValue
                                        }));
                                      }}
                                      onBlur={(e) => {
                                        if (transactionId) {
                                          const notesValue = e.target.value.trim();
                                          updateTransaction.mutate({
                                            transactionId,
                                            notes: notesValue || null
                                          });
                                        }
                                      }}
                                      placeholder="Enter note"
                                      className="min-h-[60px] text-xs resize-y w-full whitespace-pre-wrap break-words"
                                      rows={notesValues[transactionId] ? Math.max(2, Math.ceil((notesValues[transactionId] || "").split('\n').length)) : 2}
                                    />
                                    )
                                  ) : transactions && transactions.length > 0 ? (
                                    (() => {
                                      const sortedTransactions = [...transactions].sort((a, b) => 
                                        new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
                                      );
                                      const fallbackTransaction = rowIdx >= 0 && rowIdx < sortedTransactions.length 
                                        ? sortedTransactions[rowIdx] 
                                        : null;
                                      const fallbackTransactionId = fallbackTransaction?.id;
                                      
                                      if (fallbackTransactionId) {
                                        const fallbackNote = notesValues[fallbackTransactionId] || "";
                                        return isAuditor ? (
                                          // Read-only display for auditors
                                          <div className="text-xs whitespace-pre-wrap break-words min-h-[60px]">
                                            {fallbackNote || "—"}
                                          </div>
                                        ) : (
                                          <Textarea
                                            value={fallbackNote}
                                            onChange={(e) => {
                                              const newValue = e.target.value;
                                              setNotesValues(prev => ({
                                                ...prev,
                                                [fallbackTransactionId]: newValue
                                              }));
                                            }}
                                            onBlur={(e) => {
                                              if (fallbackTransactionId) {
                                                const notesValue = e.target.value.trim();
                                                updateTransaction.mutate({
                                                  transactionId: fallbackTransactionId,
                                                  notes: notesValue || null
                                                });
                                              }
                                            }}
                                            placeholder="Enter note"
                                            className="min-h-[60px] text-xs resize-y w-full whitespace-pre-wrap break-words"
                                            rows={fallbackNote ? Math.max(2, Math.ceil(fallbackNote.split('\n').length)) : 2}
                                          />
                                        );
                                      }
                                      return <span className="text-muted-foreground text-xs">—</span>;
                                    })()
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                              );
                            }
                          });

                          // Check if transaction has no category - mark with red color
                          // Also check fallback transaction if no exact match
                          let transactionForHighlight = matchingTransaction;
                          if (!transactionForHighlight && transactions && transactions.length > 0) {
                            const sortedTransactions = [...transactions].sort((a, b) => 
                              new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
                            );
                            if (rowIdx >= 0 && rowIdx < sortedTransactions.length) {
                              transactionForHighlight = sortedTransactions[rowIdx];
                            }
                          }
                          const hasNoCategory = transactionForHighlight && !transactionForHighlight.category;
                          const rowClassName = hasNoCategory 
                            ? "hover:bg-muted/50 bg-red-50/50 border-l-4 border-l-red-500" 
                            : "hover:bg-muted/50";

                          return (
                            <TableRow key={rowIdx} className={rowClassName}>
                              {cells}
                            </TableRow>
                          );
                          })
                        })()}
                      </TableBody>
                    </Table>
                  );
                })()}
              </div>
            ) : excelData.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-600" />
                <p>Could not load document data.</p>
                <p className="text-sm mt-2">The file may not be in Excel format or could not be parsed.</p>
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No transaction data found in the document.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Proof Confirmation Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={(open) => {
          console.log('AlertDialog onOpenChange called with:', open);
          setDeleteConfirmOpen(open);
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Proof</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this proof? This will permanently remove the file from storage and clear the proof from this transaction. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingProof}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProof}
                disabled={deletingProof}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingProof ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      {/* Delete Category Confirmation Dialog */}
      <AlertDialog 
        open={categoryDeleteDialogOpen} 
        onOpenChange={(open) => {
          setCategoryDeleteDialogOpen(open);
          if (!open) {
            // Reset state when dialog is closed
            setCategoryToDelete(null);
            setSelectedCategoryForDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the category "{categoryToDelete?.name || 'this category'}"? This action cannot be undone. Any transactions using this category will have their category field cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={deleteCategory.isPending}
              onClick={() => {
                setCategoryDeleteDialogOpen(false);
                setCategoryToDelete(null);
                setSelectedCategoryForDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (categoryToDelete) {
                  deleteCategory.mutate(categoryToDelete.id, {
                    onSuccess: () => {
                      setCategoryDeleteDialogOpen(false);
                      setCategoryToDelete(null);
                      setSelectedCategoryForDelete(null);
                      // Clear the filter if the deleted category was selected
                      if (filterCategory === categoryToDelete.name) {
                        setFilterCategory("");
                      }
                    },
                    onError: (error) => {
                      console.error("Error deleting category:", error);
                    },
                  });
                }
              }}
              disabled={deleteCategory.isPending || !categoryToDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCategory.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Categories Warning Dialog */}
      <AlertDialog 
        open={unsavedCategoriesDialogOpen} 
        onOpenChange={(open) => {
          setUnsavedCategoriesDialogOpen(open);
          if (!open) {
            setPendingBackNavigation(false);
            setPendingNavigationPath(null);
            navigationBlockedRef.current = false;
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Categories</AlertDialogTitle>
            <AlertDialogDescription>
              You have {getUnsavedCategoryTransactions().length} unsaved categor{getUnsavedCategoryTransactions().length === 1 ? 'y' : 'ies'}. 
              Do you want to save all categories before leaving this page?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setUnsavedCategoriesDialogOpen(false);
                setPendingBackNavigation(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // Discard changes and navigate
                const unsavedTransactions = getUnsavedCategoryTransactions();
                unsavedTransactions.forEach((transactionId) => {
                  setShowNewCategoryInput(prev => ({
                    ...prev,
                    [transactionId]: false
                  }));
                  setNewCategoryInputs(prev => {
                    const updated = { ...prev };
                    delete updated[transactionId];
                    return updated;
                  });
                });
                setUnsavedCategoriesDialogOpen(false);
                navigationBlockedRef.current = false;
                handleNavigationAfterSave();
              }}
              className="bg-background border border-input hover:bg-accent hover:text-accent-foreground"
            >
              Discard Changes
            </AlertDialogAction>
            <AlertDialogAction
              onClick={saveAllUnsavedCategories}
              disabled={createCategory.isPending || updateTransaction.isPending}
            >
              {createCategory.isPending || updateTransaction.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save All"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
            <p className="text-muted-foreground">
              View and manage transaction details from bank statements
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={transactionsViewMode === "all" ? "default" : "outline"}
              onClick={() => setTransactionsViewMode("all")}
            >
              All Transactions
            </Button>
            <Button
              variant={transactionsViewMode === "statement" ? "default" : "outline"}
              onClick={() => setTransactionsViewMode("statement")}
            >
              By Statement
            </Button>
          </div>
        </div>
      </div>

      {transactionsViewMode === "all" ? (
      <>
      {/* Filter Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>
            Filter transactions by category, mode of payment, type, or date range
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="filter-category">Category</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={filterCategory || "all"} onValueChange={(value) => setFilterCategory(value === "all" ? "" : value)}>
                    <SelectTrigger id="filter-category">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.category_id} value={cat.category_name}>
                          {cat.category_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!isAuditor && (
                  <>
                    {selectedCategoryForDelete ? (
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          const selectedCategory = categories?.find(cat => cat.category_name === selectedCategoryForDelete);
                          if (selectedCategory) {
                            setCategoryToDelete({ id: selectedCategory.category_id, name: selectedCategory.category_name });
                            setCategoryDeleteDialogOpen(true);
                          }
                        }}
                        title={`Delete category: ${selectedCategoryForDelete}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <DropdownMenu open={categoryDeleteDropdownOpen} onOpenChange={setCategoryDeleteDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={(e) => {
                              e.preventDefault();
                              setCategoryDeleteDropdownOpen(true);
                            }}
                            title="Delete category"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              setCategoryDeleteDropdownOpen(false);
                            }}
                            className="text-muted-foreground"
                            disabled
                          >
                            Select a category to delete
                          </DropdownMenuItem>
                          {categories && categories.length > 0 ? (
                            categories.map((cat) => (
                              <DropdownMenuItem
                                key={cat.category_id}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setSelectedCategoryForDelete(cat.category_name);
                                  setCategoryDeleteDropdownOpen(false);
                                }}
                              >
                                {cat.category_name}
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <DropdownMenuItem disabled className="text-muted-foreground">
                              No categories available
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                )}
              </div>
              {selectedCategoryForDelete && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Selected: {selectedCategoryForDelete}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => {
                      setSelectedCategoryForDelete(null);
                      setCategoryToDelete(null);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-mode">Mode of Payment</Label>
              <Select value={filterModeOfPayment || "all"} onValueChange={(value) => setFilterModeOfPayment(value === "all" ? "" : value)}>
                <SelectTrigger id="filter-mode">
                  <SelectValue placeholder="All modes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modes</SelectItem>
                  {uniqueModeOfPayments.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-type">Type</Label>
              <Select value={filterTransactionType || "all"} onValueChange={(value) => setFilterTransactionType(value === "all" ? "" : value)}>
                <SelectTrigger id="filter-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-start-date">Start Date</Label>
              <Input
                id="filter-start-date"
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-end-date">End Date</Label>
              <Input
                id="filter-end-date"
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </div>
          </div>
          {(filterCategory || filterModeOfPayment || filterTransactionType || filterStartDate || filterEndDate) && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterCategory("");
                  setFilterModeOfPayment("");
                  setFilterTransactionType("");
                  setFilterStartDate("");
                  setFilterEndDate("");
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Statement Transactions</CardTitle>
          <CardDescription>
            Showing transactions from all uploaded statements
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading || allTransactionsLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : deduplicatedDisplayRows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction Date</TableHead>
                  <TableHead>Value Date</TableHead>
                  <TableHead>Mode of Payment</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Debit</TableHead>
                  <TableHead>Credit</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deduplicatedDisplayRows.map((row) => {
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.txnDate}</TableCell>
                      <TableCell>{row.valueDate}</TableCell>
                      <TableCell>{row.modeOfPayment}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell className="text-red-600">{row.debit}</TableCell>
                      <TableCell className="text-green-600">{row.credit}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {row.type}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium">No transactions found</p>
              <p className="text-sm text-muted-foreground">
                Upload statements from the Statement page to view transactions
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      </>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Bank Statements</CardTitle>
          <CardDescription>
            Select a statement to view its transaction details
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : statements && statements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead>Opening Balance</TableHead>
                  <TableHead>Closing Balance</TableHead>
                  <TableHead>Total Credits</TableHead>
                  <TableHead>Total Debits</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((statement: any) => (
                  <TableRow
                    key={statement.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedStatementId(statement.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{statement.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatementPeriod statementId={statement.id} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {(statement.metadata as any)?.total_transactions || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(statement.opening_balance)}</TableCell>
                    <TableCell>{formatCurrency(statement.closing_balance)}</TableCell>
                    <TableCell className="text-green-600">
                      {formatCurrency(statement.total_credits)}
                    </TableCell>
                    <TableCell className="text-red-600">
                      {formatCurrency(statement.total_debits)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(statement.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStatementId(statement.id);
                        }}
                        title="View Transactions"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium">No statements found</p>
              <p className="text-sm text-muted-foreground">
                Upload statements from the Statement page to view transactions
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Link Proof Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Proof from Invoice or Expense</DialogTitle>
            <DialogDescription>
              Select a file from an existing invoice or expense to link as proof.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Receipts Section */}
            <div>
              <h4 className="font-semibold mb-2">Receipts</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {receipts && receipts.length > 0 ? (
                  receipts
                    .filter((receipt) => receipt.file_url)
                    .map((receipt) => (
                      <div
                        key={receipt.id}
                        className="flex items-center justify-between p-2 border rounded hover:bg-muted cursor-pointer"
                        onClick={() => {
                          if (currentTransactionId && receipt.file_url) {
                            setProofValues(prev => ({
                              ...prev,
                              [currentTransactionId]: receipt.file_url || ""
                            }));
                            updateTransaction.mutate({
                              transactionId: currentTransactionId,
                              proof: receipt.file_url || ""
                            });
                            setLinkDialogOpen(false);
                            setCurrentTransactionId(null);
                            toast({
                              title: "Proof linked",
                              description: "Proof has been linked successfully.",
                            });
                          }
                        }}
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{receipt.vendor}</p>
                          <p className="text-xs text-muted-foreground">
                            {receipt.receipt_number} • {format(new Date(receipt.receipt_date), "MMM d, yyyy")}
                          </p>
                        </div>
                        <File className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">No receipts with files found</p>
                )}
              </div>
            </div>

            {/* Expenses Section */}
            <div>
              <h4 className="font-semibold mb-2">Expenses</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {expenses && expenses.length > 0 ? (
                  expenses
                    .filter((expense) => {
                      // Check if expense has a receipt with file_url
                      return expense.receipt_id;
                    })
                    .map((expense) => {
                      // Find the receipt for this expense
                      const receipt = receipts?.find((r) => r.id === expense.receipt_id);
                      if (!receipt?.file_url) return null;
                      
                      return (
                        <div
                          key={expense.id}
                          className="flex items-center justify-between p-2 border rounded hover:bg-muted cursor-pointer"
                          onClick={() => {
                            if (currentTransactionId && receipt.file_url) {
                              setProofValues(prev => ({
                                ...prev,
                                [currentTransactionId]: receipt.file_url || ""
                              }));
                              updateTransaction.mutate({
                                transactionId: currentTransactionId,
                                proof: receipt.file_url || ""
                              });
                              setLinkDialogOpen(false);
                              setCurrentTransactionId(null);
                              toast({
                                title: "Proof linked",
                                description: "Proof has been linked successfully.",
                              });
                            }
                          }}
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{expense.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(expense.expense_date), "MMM d, yyyy")} • {formatCurrency(expense.amount)}
                            </p>
                          </div>
                          <File className="h-4 w-4 text-muted-foreground" />
                        </div>
                      );
                    })
                    .filter(Boolean)
                ) : (
                  <p className="text-sm text-muted-foreground">No expenses with receipt files found</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Proof Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Proof</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this proof? This will permanently remove the file from storage and clear the proof from this transaction. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingProof}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProof}
              disabled={deletingProof}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingProof ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Transactions;
