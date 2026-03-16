-- Fill employee_number for employees imported from payroll transactions.
-- Targets only import-created records (email ending with @payroll-import.local)
-- and only where employee_number is currently null/blank.

WITH target_rows AS (
  SELECT
    e.id,
    e.company_id,
    row_number() OVER (
      PARTITION BY e.company_id
      ORDER BY lower(e.full_name), e.id
    ) AS rn
  FROM public.employees e
  WHERE (e.employee_number IS NULL OR btrim(e.employee_number) = '')
    AND lower(coalesce(e.email, '')) LIKE '%@payroll-import.local'
)
UPDATE public.employees e
SET employee_number = concat('PR-', lpad(target_rows.rn::text, 4, '0'))
FROM target_rows
WHERE e.id = target_rows.id;
