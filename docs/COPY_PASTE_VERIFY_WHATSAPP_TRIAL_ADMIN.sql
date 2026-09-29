-- COPY-PASTE VERIFICATION FILE
-- Run after COPY_PASTE_WHATSAPP_TRIAL_ADMIN.sql.
-- These checks are read-only.

-- 1. The Meta cost-rate table must exist.
select to_regclass('public.whatsapp_meta_cost_rates') as meta_cost_rate_table;

-- 2. Both admin RPCs must exist.
select
  to_regprocedure('public.admin_set_whatsapp_meta_cost_rate(text,numeric,text,timestamp with time zone)')
    as set_rate_rpc,
  to_regprocedure('public.admin_whatsapp_profitability(timestamp with time zone,timestamp with time zone,text)')
    as profitability_rpc;

-- 3. Anonymous callers must not be able to execute the privileged RPCs;
-- authenticated sessions may execute them, but each RPC still performs its
-- own app.is_platform_admin() authorization check.
select
  has_function_privilege(
    'anon',
    'public.admin_set_whatsapp_meta_cost_rate(text,numeric,text,timestamp with time zone)',
    'execute'
  ) as anon_can_set_rate,
  has_function_privilege(
    'authenticated',
    'public.admin_set_whatsapp_meta_cost_rate(text,numeric,text,timestamp with time zone)',
    'execute'
  ) as authenticated_can_set_rate,
  has_function_privilege(
    'anon',
    'public.admin_whatsapp_profitability(timestamp with time zone,timestamp with time zone,text)',
    'execute'
  ) as anon_can_read_profitability,
  has_function_privilege(
    'authenticated',
    'public.admin_whatsapp_profitability(timestamp with time zone,timestamp with time zone,text)',
    'execute'
  ) as authenticated_can_read_profitability;

-- Expected booleans: false, true, false, true.

-- 4. Confirm the reported owner-name correction.
select email, first_name, last_name, role
from public.staff_memberships
where lower(email::text) = 'ogoxygengym@gmail.com';

-- Expected owner name: Shaik Riyaz.

-- 5. The rate table starts empty intentionally. Rates must come from your
-- current Meta rate card or invoice; the app never invents a cost.
select category, cost_minor, currency, effective_from, created_at
from public.whatsapp_meta_cost_rates
order by category, effective_from desc;
