-- Update monthly auto-payslip generation to use Payroll page data only.
-- Includes all active employees (including imported employees) when:
-- 1) Annual CTC > 0
-- 2) Date of Joining is present in employee_details
-- Salary components are taken only from employee_details.

CREATE OR REPLACE FUNCTION public.generate_monthly_payslips_on_third(
  p_run_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_month_start DATE := date_trunc('month', (p_run_date - INTERVAL '1 month'))::date;
  v_prev_month_end DATE := (date_trunc('month', p_run_date)::date - 1);
  v_inserted_count INTEGER := 0;
BEGIN
  WITH employee_salary AS (
    SELECT
      e.id AS employee_id,
      e.company_id,
      ed.date_of_joining AS join_date,
      COALESCE(NULLIF(ed.total_annual_ctc, 0), NULLIF(ed.annual_ctc, 0), 0)::numeric AS annual_ctc,
      COALESCE(ed.basic_monthly, 0)::numeric AS basic_monthly,
      COALESCE(ed.house_rent_allowance_monthly, 0)::numeric AS house_rent_allowance_monthly,
      COALESCE(ed.conveyance_allowance_monthly, 0)::numeric AS conveyance_allowance_monthly,
      COALESCE(ed.medical_reimbursement_monthly, 0)::numeric AS medical_reimbursement_monthly,
      COALESCE(ed.other_benefit_monthly, 0)::numeric AS other_benefit_monthly,
      COALESCE(ed.special_allowance_monthly, 0)::numeric AS special_allowance_monthly,
      COALESCE(ed.custom_salary_components, '[]'::jsonb) AS custom_salary_components
    FROM public.employees e
    JOIN public.employee_details ed
      ON ed.employee_id = e.id
    WHERE COALESCE(NULLIF(ed.total_annual_ctc, 0), NULLIF(ed.annual_ctc, 0), 0) > 0
      AND ed.date_of_joining IS NOT NULL
      AND ed.date_of_joining <= v_prev_month_end
      AND lower(COALESCE(e.status, 'active')) = 'active'
  ),
  target_months AS (
    SELECT
      es.employee_id,
      es.company_id,
      es.basic_monthly,
      es.house_rent_allowance_monthly,
      es.conveyance_allowance_monthly,
      es.medical_reimbursement_monthly,
      es.other_benefit_monthly,
      es.special_allowance_monthly,
      es.custom_salary_components,
      gs::date AS period_start,
      (date_trunc('month', gs) + INTERVAL '1 month - 1 day')::date AS period_end
    FROM employee_salary es
    CROSS JOIN LATERAL generate_series(
      date_trunc('month', es.join_date)::date,
      v_prev_month_start,
      INTERVAL '1 month'
    ) AS gs
  ),
  computed AS (
    SELECT
      tm.employee_id,
      tm.company_id,
      tm.period_start,
      tm.period_end,
      tm.basic_monthly AS basic_salary,
      (
        tm.house_rent_allowance_monthly +
        tm.conveyance_allowance_monthly +
        tm.medical_reimbursement_monthly +
        tm.other_benefit_monthly +
        tm.special_allowance_monthly +
        COALESCE((
          SELECT SUM(CASE WHEN (comp->>'monthly')::numeric >= 0 THEN (comp->>'monthly')::numeric ELSE 0 END)
          FROM jsonb_array_elements(tm.custom_salary_components) comp
          WHERE (comp ? 'monthly')
            AND (comp->>'monthly') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        ), 0)
      )::numeric AS allowances,
      (
        200 +
        COALESCE((
          SELECT SUM(CASE WHEN (comp->>'monthly')::numeric < 0 THEN ABS((comp->>'monthly')::numeric) ELSE 0 END)
          FROM jsonb_array_elements(tm.custom_salary_components) comp
          WHERE (comp ? 'monthly')
            AND (comp->>'monthly') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        ), 0)
      )::numeric AS deductions
    FROM target_months tm
  ),
  to_insert AS (
    SELECT
      c.company_id,
      c.employee_id,
      c.period_start,
      c.period_end,
      c.basic_salary,
      c.allowances,
      c.deductions,
      (c.basic_salary + c.allowances - c.deductions)::numeric AS net_pay,
      'pending'::text AS status,
      p_run_date AS pay_date,
      'Auto-generated monthly payslip'::text AS notes,
      NULL::uuid AS created_by
    FROM computed c
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.payslips p
      WHERE p.employee_id = c.employee_id
        AND p.period_start = c.period_start
        AND p.period_end = c.period_end
    )
  ),
  inserted AS (
    INSERT INTO public.payslips (
      company_id,
      employee_id,
      period_start,
      period_end,
      basic_salary,
      allowances,
      deductions,
      net_pay,
      status,
      pay_date,
      notes,
      created_by
    )
    SELECT
      company_id,
      employee_id,
      period_start,
      period_end,
      basic_salary,
      allowances,
      deductions,
      net_pay,
      status,
      pay_date,
      notes,
      created_by
    FROM to_insert
    RETURNING id
  )
  SELECT COUNT(*) INTO v_inserted_count FROM inserted;

  RETURN jsonb_build_object(
    'run_date', p_run_date,
    'previous_month_start', v_prev_month_start,
    'previous_month_end', v_prev_month_end,
    'inserted_payslips', v_inserted_count
  );
END;
$$;

COMMENT ON FUNCTION public.generate_monthly_payslips_on_third(date)
IS 'Runs monthly payslip generation using employee_details salary components for active employees with annual CTC > 0 and valid date_of_joining.';

GRANT EXECUTE ON FUNCTION public.generate_monthly_payslips_on_third(date) TO service_role;

DO $$
DECLARE
  v_existing_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'monthly_payslip_generation_on_3rd'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'monthly_payslip_generation_on_3rd',
    '0 3 3 * *',
    'SELECT public.generate_monthly_payslips_on_third();'
  );

  -- Run once immediately after applying this update.
  PERFORM public.generate_monthly_payslips_on_third(CURRENT_DATE);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job table not available; monthly payslip schedule was not created in this environment.';
END;
$$;
