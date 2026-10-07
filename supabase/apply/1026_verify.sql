-- Read-only checks after applying 1026 to an explicitly selected project.
select column_name,data_type from information_schema.columns
where table_schema='public' and table_name='staff_invitations'
  and column_name in ('invitation_channel','phone_auth_user_id','phone_verified_at');

select p.proname,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('admin_create_gym_owner_phone_invitation','admin_get_owner_phone_delivery',
  'link_gym_owner_phone_identity','complete_phone_login');
-- anon: false for all. authenticated: true only for the two admin-gated RPCs.
-- The identity-link/enrollment RPCs must be service_role only.

select indexname,indexdef from pg_indexes where schemaname='public'
  and indexname in ('staff_invitations_pending_owner_phone_uq','staff_invitations_phone_auth_user_idx');
select relname,relrowsecurity from pg_class where oid in
  ('public.staff_invitations'::regclass,'public.auth_otp_codes'::regclass);
