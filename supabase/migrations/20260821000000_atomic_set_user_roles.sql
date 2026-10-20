-- Atomic role assignment.
--
-- The client previously updated roles with a DELETE followed by a separate INSERT.
-- Because the user_roles RLS policy is `is_admin(auth.uid())`, an admin editing their
-- OWN roles would pass the DELETE (still admin at that point), lose their admin row,
-- and then be denied on the INSERT -- ending up with zero roles and locked out of the
-- application. The two statements also left roles empty if the second one failed for
-- any other reason.
--
-- set_user_roles() performs both steps inside a single function invocation, so the
-- change either fully applies or fully rolls back. It also refuses to remove the last
-- remaining admin, which would leave the tenant with nobody able to manage roles.

CREATE OR REPLACE FUNCTION public.set_user_roles(_user_id uuid, _roles public.app_role[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  remaining_admins int;
BEGIN
  -- Only admins may change roles. Enforced here because SECURITY DEFINER bypasses RLS.
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can change user roles'
      USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'A target user is required' USING ERRCODE = '22004';
  END IF;

  -- Guard against removing the final admin.
  IF NOT (_roles && ARRAY['admin', 'super_admin']::public.app_role[]) THEN
    SELECT count(DISTINCT user_id) INTO remaining_admins
    FROM public.user_roles
    WHERE role IN ('admin', 'super_admin')
      AND user_id <> _user_id;

    IF remaining_admins = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last admin. Grant admin to another user first.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;

  IF array_length(_roles, 1) IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT _user_id, unnest(_roles)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_user_roles(uuid, public.app_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_roles(uuid, public.app_role[]) TO authenticated;

-- Prevent duplicate (user_id, role) pairs, which the old delete/insert cycle could
-- leave behind if an insert partially succeeded.
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key
  ON public.user_roles (user_id, role);
