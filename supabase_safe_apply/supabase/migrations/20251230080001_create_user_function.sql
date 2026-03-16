-- Create function for admins to create users and assign roles
-- This function runs with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.create_user_with_roles(
  _email TEXT,
  _full_name TEXT,
  _company_id UUID,
  _roles TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _role TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can create users';
  END IF;

  -- Note: This function assumes the user has already been created in auth.users
  -- via Supabase Auth. We need the user_id to be passed or we need to get it from auth.users
  
  -- For now, we'll create a function that updates the profile and roles
  -- The actual auth user creation must happen first via Supabase Auth API
  
  RETURN NULL;
END;
$$;
-- Better approach: Function to update user profile and roles after auth creation
-- This function bypasses RLS by running with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.setup_user_profile(
  _user_id UUID,
  _email TEXT,
  _full_name TEXT,
  _company_id UUID,
  _roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can setup user profiles';
  END IF;

  -- Update or insert profile (bypasses RLS due to SECURITY DEFINER)
  INSERT INTO public.profiles (id, email, full_name, company_id)
  VALUES (_user_id, _email, _full_name, _company_id)
  ON CONFLICT (id) DO UPDATE
  SET full_name = _full_name, company_id = _company_id;

  -- Remove existing roles (bypasses RLS)
  DELETE FROM public.user_roles WHERE user_id = _user_id;

  -- Add new roles (bypasses RLS)
  IF array_length(_roles, 1) > 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT _user_id, unnest(_roles::app_role[]);
  END IF;

  RETURN TRUE;
END;
$$;
