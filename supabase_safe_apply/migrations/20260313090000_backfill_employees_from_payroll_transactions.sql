-- Backfill employees from payroll-category bank transactions.
-- Name is extracted from the description segment between the 2nd and 3rd '/':
-- Example: NEFT/IDFB603563167184/GOWTHAMI KANDI/KKBK0001368 -> GOWTHAMI KANDI

WITH payroll_candidates AS (
  SELECT DISTINCT
    bs.company_id,
    btrim(split_part(bst.description, '/', 3)) AS full_name
  FROM public.bank_statement_transactions bst
  JOIN public.bank_statements bs
    ON bs.id = bst.statement_id
  WHERE lower(coalesce(bst.category, '')) = 'payroll'
    AND coalesce(bst.description, '') LIKE '%/%/%'
    AND nullif(btrim(split_part(bst.description, '/', 3)), '') IS NOT NULL
), normalized AS (
  SELECT
    company_id,
    full_name,
    coalesce(
      nullif(lower(regexp_replace(full_name, '[^a-z0-9]+', '.', 'gi')), ''),
      'employee'
    ) AS name_slug
  FROM payroll_candidates
)
INSERT INTO public.employees (
  company_id,
  full_name,
  email,
  status,
  created_at,
  updated_at
)
SELECT
  n.company_id,
  n.full_name,
  concat(left(n.name_slug, 80), '@payroll-import.local') AS email,
  'active',
  now(),
  now()
FROM normalized n
WHERE NOT EXISTS (
  SELECT 1
  FROM public.employees e
  WHERE e.company_id IS NOT DISTINCT FROM n.company_id
    AND lower(btrim(e.full_name)) = lower(btrim(n.full_name))
);
