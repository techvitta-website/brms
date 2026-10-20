import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { useCompany } from "./useCompany";

export type Profile = Tables<"profiles">;
export type UserRole = Tables<"user_roles">;

export interface UserWithRoles extends Profile {
  roles: string[];
  lastLogin?: string;
}

export function useUsers() {
  const { data: company } = useCompany();

  return useQuery({
    queryKey: ["users", company?.id],
    queryFn: async () => {
      // Get all profiles (admins can see all)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      // Combine profiles with their roles
      const usersWithRoles: UserWithRoles[] = (profiles || []).map((profile) => {
        const userRoles = (roles || [])
          .filter((r) => r.user_id === profile.id)
          .map((r) => r.role);
        
        return {
          ...profile,
          roles: userRoles,
        };
      });

      return usersWithRoles;
    },
    enabled: !!company?.id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  const { data: company } = useCompany();

  return useMutation({
    mutationFn: async ({
      email,
      password,
      fullName,
      roles,
    }: {
      email: string;
      password: string;
      fullName: string;
      roles: string[];
    }) => {
      // Create user in auth using signUp
      // Note: This will send a confirmation email unless email confirmation is disabled
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Failed to create user");

      const userId = authData.user.id;

      // Wait a bit for the trigger to create the profile
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Use database function to setup profile and roles (bypasses RLS)
      const { data: setupResult, error: setupError } = await supabase.rpc(
        "setup_user_profile",
        {
          _user_id: userId,
          _email: email,
          _full_name: fullName,
          _company_id: company?.id || null,
          _roles: roles,
        }
      );

      if (setupError) {
        // Fallback: Try direct updates if function doesn't exist or fails
        // This might fail due to RLS - user needs to run migrations
        console.warn("setup_user_profile function failed, trying direct update:", setupError);
        
        // Try to update profile
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            company_id: company?.id || null,
          })
          .eq("id", userId);

        if (profileError) {
          // If update fails, try to insert
          const { error: insertError } = await supabase
            .from("profiles")
            .insert({
              id: userId,
              email,
              full_name: fullName,
              company_id: company?.id || null,
            });

          if (insertError) {
            // RLS error - provide helpful message
            if (insertError.code === "42501" || insertError.message.includes("policy")) {
              throw new Error(
                "RLS Policy Error: Please run the database migrations to fix user management permissions. " +
                "Migration files: 20251230080000_fix_user_management_rls.sql and 20251230080001_create_user_function.sql"
              );
            }
            console.error("Profile creation error:", insertError);
            // Continue anyway - the trigger might have created it
          }
        }

        // Update roles manually
        if (roles.length > 0) {
          // Remove all existing roles
          const { error: deleteError } = await supabase
            .from("user_roles")
            .delete()
            .eq("user_id", userId);

          if (deleteError && deleteError.code === "42501") {
            throw new Error(
              "RLS Policy Error: Please run the database migrations to fix user management permissions."
            );
          }

          // Add selected roles
          const roleInserts = roles.map((role) => ({
            user_id: userId,
            role: role as any,
          }));

          const { error: rolesError } = await supabase
            .from("user_roles")
            .insert(roleInserts);

          if (rolesError) {
            if (rolesError.code === "42501" || rolesError.message.includes("policy")) {
              throw new Error(
                "RLS Policy Error: Please run the database migrations to fix user management permissions. " +
                "Migration files: 20251230080000_fix_user_management_rls.sql and 20251230080001_create_user_function.sql"
              );
            }
            throw new Error(`Failed to assign roles: ${rolesError.message}`);
          }
        }
      }

      return authData.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({
        title: "User created",
        description: "The user has been successfully created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateUserRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      roles,
    }: {
      userId: string;
      roles: string[];
    }) => {
      // Apply the whole role set in one transaction.
      //
      // The previous DELETE-then-INSERT was not atomic: an admin editing their own
      // roles passed the DELETE, lost their admin row, and was then denied on the
      // INSERT by the `is_admin(auth.uid())` RLS policy -- leaving them with no roles
      // at all. set_user_roles() does both steps server-side and also refuses to
      // remove the last admin.
      const { error } = await supabase.rpc("set_user_roles" as any, {
        _user_id: userId,
        _roles: roles,
      } as any);

      if (error) throw error;

      return { userId, roles };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({
        title: "Roles updated",
        description: "User roles have been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update roles",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
