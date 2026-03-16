-- Retry backfill of employees from payroll transactions.
-- This migration is intentionally re-runnable and more tolerant than the first pass:
-- 1) category match is case/whitespace-insensitive and also checks metadata.category
-- 2) name extraction supports description pattern with slash segments and metadata fallbacks
-- 3) duplicate prevention is by (company_id, full_name case-insensitive)

WITH source_rows AS (
  SELECT
    bs.company_id,
    bst.description,
    lower(btrim(coalesce(
      bst.category,
      bst.metadata->>'category',
      bst.metadata->>'Category',
      ''
    ))) AS category_norm,
    CASE
      WHEN coalesce(bst.description, '') ~ '^[^/]+/[^/]+/[^/]+'
        THEN btrim(split_part(bst.description, '/', 3))
      ELSE NULL
    END AS parsed_from_description,
    nullif(btrim(coalesce(
      bst.metadata->>'employee_name',
      bst.metadata->>'employeeName',
      bst.metadata->>'payee_name',
      bst.metadata->>'payeeName',
      ''
    )), '') AS parsed_from_metadata
  FROM public.bank_statement_transactions bst
  JOIN public.bank_statements bs
    ON bs.id = bst.statement_id
), payroll_candidates AS (
  SELECT DISTINCT
    company_id,
    nullif(
      btrim(coalesce(parsed_from_description, parsed_from_metadata, '')),
      ''
    ) AS full_name
  FROM source_rows
  WHERE category_norm = 'payroll'
), normalized AS (
  SELECT
    company_id,
    full_name,
    coalesce(
      nullif(lower(regexp_replace(full_name, '[^a-z0-9]+', '.', 'gi')), ''),
      'employee'
    ) AS name_slug
  FROM payroll_candidates
  WHERE full_name IS NOT NULL
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
  concat(
    left(n.name_slug, 60),
    '.',
    substring(md5(coalesce(n.company_id::text, 'no-company') || '|' || n.full_name) from 1 for 8),
    '@payroll-import.local'
  ) AS email,
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
