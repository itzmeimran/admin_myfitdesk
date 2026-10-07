-- Read-only checks after installing 1025 in either environment.
begin read only;
do $$
declare p record;
begin
 if not exists(select 1 from pg_attribute where attrelid='public.platform_sales_leads'::regclass and attname='created_by' and not attisdropped) then
  raise exception '1025 created_by column missing';
 end if;
 select * into strict p from pg_proc where oid='public.admin_sales_create_lead(uuid,jsonb)'::regprocedure;
 if not p.prosecdef or not ('search_path=public, pg_temp'=any(p.proconfig)) then raise exception 'Manual lead RPC boundary missing'; end if;
 if has_function_privilege('anon',p.oid,'EXECUTE') or not has_function_privilege('authenticated',p.oid,'EXECUTE') then
  raise exception 'Manual lead RPC grants incorrect';
 end if;
 if has_table_privilege('authenticated','public.platform_sales_leads','INSERT,UPDATE,DELETE') then raise exception 'Direct CRM writes exposed'; end if;
 if not exists(select 1 from pg_class where oid='public.platform_sales_leads'::regclass and relrowsecurity and relforcerowsecurity) then
  raise exception 'CRM forced RLS missing';
 end if;
 if position('An active paid plan is required' in pg_get_functiondef('public.admin_sales_command(uuid,text,jsonb)'::regprocedure))=0 then
  raise exception 'Paid conversion guard missing';
 end if;
 raise notice '1025 schema, RLS, grants and conversion guards verified';
end $$;
rollback;
