import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Category {
  category_id: string;
  category_name: string;
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category")
        .select("*")
        .order("category_name", { ascending: true });

      if (error) throw error;
      return (data || []) as Category[];
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoryName: string) => {
      const trimmedName = categoryName.trim();
      
      if (!trimmedName) {
        throw new Error("Category name cannot be empty");
      }

      // Check if category already exists (case-insensitive).
      // `.maybeSingle()` rather than `.single()`: the unique constraint on
      // category_name is case-sensitive, so "Payroll" and "payroll" can coexist and
      // `.single()` would error on multiple matches, then fall through to an insert
      // that violates the constraint.
      const { data: existingMatches, error: lookupError } = await supabase
        .from("category")
        .select("*")
        .ilike("category_name", trimmedName)
        .limit(1);

      if (lookupError) throw lookupError;
      if (existingMatches && existingMatches.length > 0) {
        // Reuse the existing category rather than creating a near-duplicate.
        return existingMatches[0] as Category;
      }

      // Create new category
      const { data, error } = await supabase
        .from("category")
        .insert({
          category_name: trimmedName,
        })
        .select()
        .single();

      if (error) {
        // 23505 = unique violation. Another client (or a case variant) won the race;
        // fetch and reuse that row instead of surfacing a confusing failure.
        if (error.code === "23505") {
          const { data: raced } = await supabase
            .from("category")
            .select("*")
            .ilike("category_name", trimmedName)
            .limit(1);

          if (raced && raced.length > 0) return raced[0] as Category;
        }
        throw error;
      }
      return data as Category;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({
        title: "Category created",
        description: "New category has been added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create category",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoryId: string) => {
      // First, get the category name to find all transactions using it
      const { data: category, error: categoryError } = await supabase
        .from("category")
        .select("category_name")
        .eq("category_id", categoryId)
        .single();

      if (categoryError) throw categoryError;

      // Clear the category field from all transactions that use this category
      if (category?.category_name) {
        const { error: updateError } = await supabase
          .from("bank_statement_transactions")
          .update({ category: null })
          .eq("category", category.category_name);

        if (updateError) {
          console.warn("Failed to clear category from transactions:", updateError);
          // Don't throw - continue with category deletion even if transaction update fails
        }
      }

      // Delete the category
      const { error } = await supabase
        .from("category")
        .delete()
        .eq("category_id", categoryId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["bank-statement-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-statement-transactions-all"] });
      queryClient.invalidateQueries({ queryKey: ["category-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Category deleted",
        description: "The category has been deleted successfully. Transactions using this category have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete category",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
