-- DEV only, after 1021 and 1022. Run the complete file in SQL Editor.
-- Uses disposable rows and authenticated role/JWT context; EVERYTHING rolls back.
-- No email or HTTP delivery is invoked. Also run scripts/test-sales-crm-db.mjs locally.
begin;
insert into auth.users(id,email,aud,role) values
 ('f0220000-0000-4000-8000-000000000001','crm-owner-1022@fixture.invalid','authenticated','authenticated'),
 ('f0220000-0000-4000-8000-000000000002','crm-manager-1022@fixture.invalid','authenticated','authenticated'),
 ('f0220000-0000-4000-8000-000000000003','crm-rep-1022@fixture.invalid','authenticated','authenticated'),
 ('f0220000-0000-4000-8000-000000000004','crm-west-1022@fixture.invalid','authenticated','authenticated'),
 ('f0220000-0000-4000-8000-000000000005','crm-support-1022@fixture.invalid','authenticated','authenticated');
insert into public.platform_admins(user_id,role,status,sales_team) values
 ('f0220000-0000-4000-8000-000000000001','platform_owner','active',null),
 ('f0220000-0000-4000-8000-000000000002','sales_manager','active','CRM verification South'),
 ('f0220000-0000-4000-8000-000000000003','sales_rep','active','CRM verification South'),
 ('f0220000-0000-4000-8000-000000000004','sales_rep','active','CRM verification West'),
 ('f0220000-0000-4000-8000-000000000005','support_admin','active',null);
insert into public.platform_sales_leads(id,gym,contact,phone,email,city,state,branches,members,owner,stage) values
 ('f0221000-0000-4000-8000-000000000001','CRM verification South','Test Owner','+919900001022','crm-1022-south@fixture.invalid','Test City','Test State','1','Under 100','f0220000-0000-4000-8000-000000000003','new'),
 ('f0221000-0000-4000-8000-000000000002','CRM verification West','Test Owner','+919900001023','crm-1022-west@fixture.invalid','Test City','Test State','1','Under 100','f0220000-0000-4000-8000-000000000004','new'),
 ('f0221000-0000-4000-8000-000000000003','CRM verification Invitation','Test Owner','+919900001024','crm-1022-invite@fixture.invalid','Test City','Test State','1','Under 100','f0220000-0000-4000-8000-000000000003','new');

set local role authenticated;
select set_config('request.jwt.claim.sub','f0220000-0000-4000-8000-000000000003',true);
do $$
declare v jsonb; f uuid;
begin
 v:=public.admin_sales_lead_detail('f0221000-0000-4000-8000-000000000001');
 if v#>>'{lead,gym}'<>'CRM verification South' then raise exception 'Own lead missing'; end if;
 begin
  perform public.admin_sales_lead_detail('f0221000-0000-4000-8000-000000000002');
  raise exception 'SECURITY FAILURE: rep read another team';
 exception when insufficient_privilege then null; end;
 begin
  perform public.admin_sales_command('f0221000-0000-4000-8000-000000000002','togglePriority','{}');
  raise exception 'SECURITY FAILURE: rep wrote another team';
 exception when insufficient_privilege then null; end;
 perform public.admin_sales_command('f0221000-0000-4000-8000-000000000001','logActivity','{"type":"Note","note":"SQL Editor verification"}');
 perform public.admin_sales_command('f0221000-0000-4000-8000-000000000001','scheduleFollowUp',jsonb_build_object('type','Call','dueAt',now()+interval '1 day','note','DEV verification'));
 v:=public.admin_sales_lead_detail('f0221000-0000-4000-8000-000000000001');f:=(v#>>'{lead,next_follow_up,id}')::uuid;
 perform public.admin_sales_command('f0221000-0000-4000-8000-000000000001','completeFollowUp',jsonb_build_object('followUpId',f));
 perform public.admin_sales_command('f0221000-0000-4000-8000-000000000001','moveLead','{"stage":"trial"}');
 perform public.admin_sales_command('f0221000-0000-4000-8000-000000000001','closeLead','{"outcome":"Follow up later","revisit":"2 weeks","reason":"","note":""}');
 perform public.admin_sales_command('f0221000-0000-4000-8000-000000000001','reopen','{}');
 perform public.admin_sales_snapshot('my');
 -- Full existing 1012 onboarding transaction, with no email delivery. Rolls back.
 v:=public.admin_sales_command('f0221000-0000-4000-8000-000000000003','convert',
  '{"how":"invite","ownerName":"CRM Test Owner","email":"crm-owner-invite-1022@fixture.invalid","plan":"Monthly"}');
 if v#>>'{invitation,organization_id}' is null then raise exception 'Owner invitation missing'; end if;
end $$;

select set_config('request.jwt.claim.sub','f0220000-0000-4000-8000-000000000002',true);
do $$ begin
 perform public.admin_sales_snapshot('team');
 begin
  perform public.admin_sales_command('f0221000-0000-4000-8000-000000000001','reassign','{"to":"f0220000-0000-4000-8000-000000000004","note":""}');
  raise exception 'SECURITY FAILURE: manager reassigned outside team';
 exception when insufficient_privilege then null; end;
 perform public.admin_sales_command('f0221000-0000-4000-8000-000000000001','reassign','{"to":"f0220000-0000-4000-8000-000000000002","note":"DEV verification"}');
end $$;

select set_config('request.jwt.claim.sub','f0220000-0000-4000-8000-000000000001',true);
do $$ begin
 perform public.admin_sales_lead_detail('f0221000-0000-4000-8000-000000000002');
 perform public.admin_sales_snapshot('all');
 perform public.admin_sales_attention_count();
end $$;

select set_config('request.jwt.claim.sub','f0220000-0000-4000-8000-000000000005',true);
do $$ begin
 begin
  perform public.admin_sales_snapshot('my');
  raise exception 'SECURITY FAILURE: non-sales admin read CRM';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
 if (select count(*) from public.admin_audit_log where admin_id in (
  'f0220000-0000-4000-8000-000000000001','f0220000-0000-4000-8000-000000000002','f0220000-0000-4000-8000-000000000003') and action like 'sales.%')<7 then
  raise exception 'Missing CRM audit rows';
 end if;
 raise notice 'CRM DEV verification passed. All fixture rows are being rolled back.';
end $$;
rollback;
