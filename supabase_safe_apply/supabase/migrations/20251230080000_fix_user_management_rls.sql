-- Fix RLS policies for user management
-- Allow admins to insert profiles (for user creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Admins can insert profiles'
  ) THEN
    CREATE POLICY "Admins can insert profiles"
      ON public.profiles FOR INSERT
      WITH CHECK (public.is_admin(auth.uid()));
  END IF;
END $$;
-- Allow admins (not just super_admins) to manage user roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_roles' 
    AND policyname = 'Super admins can manage roles'
  ) THEN
    DROP POLICY "Super admins can manage roles" ON public.user_roles;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_roles' 
    AND policyname = 'Admins can manage roles'
  ) THEN
    CREATE POLICY "Admins can manage roles"
      ON public.user_roles FOR ALL
      USING (public.is_admin(auth.uid()));
  END IF;
END $$;
