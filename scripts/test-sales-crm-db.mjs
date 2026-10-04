import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {PGlite}=await import(process.argv[2]?pathToFileURL(path.resolve(process.argv[2])).href:'@electric-sql/pglite');
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001';
const manager='00000000-0000-4000-8000-000000000002';
const rep='00000000-0000-4000-8000-000000000003';
const other='00000000-0000-4000-8000-000000000004';
const support='00000000-0000-4000-8000-000000000005';
const lead='10000000-0000-4000-8000-000000000001';
const foreign='10000000-0000-4000-8000-000000000002';
const duplicate='10000000-0000-4000-8000-000000000003';
async function actor(id){await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`);}
async function command(id,name,input={}){return (await db.query('select public.admin_sales_command($1,$2,$3::jsonb) v',[id,name,JSON.stringify(input)])).rows[0].v;}
async function snapshot(scope='my',filters={},offset=0,attention=false){return (await db.query(`select public.admin_sales_snapshot($1,null,$2::jsonb,'',$3,'90',1,$4) v`,[scope,JSON.stringify(filters),attention,offset])).rows[0].v;}
async function denied(fn){await assert.rejects(fn,/authorized|access denied|scope|permission|team/i);}
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema app;create schema auth;
 create table auth.users(id uuid primary key,email text,aud text,role text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,app,auth to anon,authenticated,service_role;
 create table public.platform_roles(role text primary key,label text,description text,sort_order integer);
 create table public.platform_role_permissions(role text references public.platform_roles,permission text,primary key(role,permission));
 create table public.platform_admins(user_id uuid primary key references auth.users,role text references public.platform_roles,status text default 'active',revoked_at timestamptz,granted_at timestamptz default now());
 create table public.organizations(id uuid primary key default gen_random_uuid(),name text,city text,contact_phone text,contact_email text,created_at timestamptz default now());
 create table public.organization_subscriptions(organization_id uuid primary key references public.organizations,status text,current_period_end timestamptz);
 create table public.admin_audit_log(id bigint generated always as identity,admin_id uuid,action text,detail jsonb,at timestamptz default now());
 create function app.is_platform_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from platform_admins where user_id=auth.uid() and status='active' and revoked_at is null)$$;
 create function app.platform_admin_role() returns text language sql stable security definer set search_path=public,pg_temp as $$select role from platform_admins where user_id=auth.uid() and status='active' and revoked_at is null$$;
 create function app.has_platform_permission(p text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from platform_admins a join platform_role_permissions r on r.role=a.role where a.user_id=auth.uid() and a.status='active' and a.revoked_at is null and r.permission=p)$$;
 create function app.write_admin_audit(p_action text,p_entity_type text,p_entity_id text,p_old jsonb default null,p_new jsonb default null,p_metadata jsonb default null) returns void language sql security definer set search_path=public,pg_temp as $$insert into admin_audit_log(admin_id,action,detail) values(auth.uid(),p_action,jsonb_build_object('id',p_entity_id,'old',p_old,'new',p_new))$$;
 insert into public.platform_roles values('platform_owner','Owner','',1),('support_admin','Support','',2);
 insert into public.platform_role_permissions values('platform_owner','gyms.manage'),('platform_owner','admins.manage');
 insert into auth.users(id,email) values('${owner}','owner@fixture.test'),('${manager}','manager@fixture.test'),('${rep}','rep@fixture.test'),('${other}','other@fixture.test'),('${support}','support@fixture.test');
 insert into public.platform_admins(user_id,role) values('${owner}','platform_owner'),('${support}','support_admin');
 grant select on public.platform_admins to service_role;
 `);
 // Existing invitation seam is stubbed only here; the actual migration delegates to 1012.
 await db.exec(`create function public.admin_create_gym_owner_invitation(p_gym_name text,p_owner_first_name text,p_owner_last_name text,p_email text,p_phone text default null,p_city text default null,p_state text default null,p_postal_code text default null,p_billing_mode text default 'trial',p_trial_days integer default 14,p_notes text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare o uuid:=gen_random_uuid();begin
 if not app.has_platform_permission('gyms.manage') then raise exception 'Not authorized';end if;
 insert into organizations(id,name,contact_email,contact_phone,city) values(o,p_gym_name,p_email,p_phone,p_city);
 insert into organization_subscriptions values(o,'trialing',now()+interval '14 days');
 return jsonb_build_object('organization_id',o,'invitation_id',gen_random_uuid(),'email',p_email);end$$;`);
 await db.exec(await readFile(new URL('../supabase/migrations/1021_book_demo_foundation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/1022_sales_crm.sql',import.meta.url),'utf8'));
 await db.exec(`insert into public.platform_admins(user_id,role,sales_team) values('${manager}','sales_manager','South'),('${rep}','sales_rep','South'),('${other}','sales_rep','West');
 insert into public.platform_sales_leads(id,gym,contact,phone,email,city,state,branches,members,owner,stage,created_at) values
 ('${lead}','Alpha Gym','Owner','+919876543210','alpha@fixture.test','Hyderabad','Telangana','1','Under 100','${rep}','new',now()-interval '10 days'),
 ('${foreign}','West Gym','West','+919876543211','west@fixture.test','Mumbai','Maharashtra','1','Under 100','${other}','new',now()),
 ('${duplicate}','Alpha New','Owner New','+919876543210','alpha-new@fixture.test','Hyderabad','Telangana','1','Under 100','${rep}','demo_req',now());
 update public.platform_sales_leads set duplicate_of='${lead}',demo_status='Awaiting confirmation',possible_existing_lead=true where id='${duplicate}';`);
 await actor(support);await denied(()=>snapshot());await denied(()=>command(lead,'togglePriority'));
 await actor(rep);await denied(()=>snapshot('all'));await denied(()=>snapshot('team'));
 assert.equal((await snapshot()).total,2);assert.equal((await snapshot()).leads.length,1);assert.equal((await snapshot('my',{},1)).leads.length,1);
 await denied(()=>db.query('select public.admin_sales_lead_detail($1)',[foreign]));await denied(()=>command(foreign,'togglePriority'));await denied(()=>command(lead,'reassign',{to:other}));
 await assert.rejects(()=>db.query('select * from public.platform_sales_leads'),/permission denied/);
 await command(lead,'logActivity',{type:'Call',note:'Owner called'});
 assert.equal((await snapshot()).attentionCount,1); // Only awaiting demo remains after contact.
 await assert.rejects(()=>command(lead,'logActivity',{type:'Note',note:''}),/note/i);
 await assert.rejects(()=>command(lead,'moveLead',{stage:'converted'}),/flow/i);
 await command(lead,'moveLead',{stage:'trial'});
 const due=new Date(Date.now()+86400000).toISOString();
 await command(lead,'scheduleFollowUp',{type:'Call',dueAt:due,note:'First'});
 await command(lead,'scheduleFollowUp',{type:'Email',dueAt:new Date(Date.now()+172800000).toISOString(),note:'Second'});
 await db.exec('reset role');await db.exec(`update public.platform_sales_follow_ups set due_at=now()-interval '1 hour' where type='Call';`);await actor(rep);
 assert.equal((await snapshot('my',{followUp:'overdue'})).total,1);
 const detail=(await db.query('select public.admin_sales_lead_detail($1) v',[lead])).rows[0].v;
 assert.equal(detail.lead.next_follow_up.type,'Call');assert.ok(detail.lead.attention.includes('overdue'));
 await command(lead,'completeFollowUp',{followUpId:detail.lead.next_follow_up.id});
 assert.equal((await snapshot('my',{followUp:'overdue'})).total,0);
 await command(duplicate,'resolveDuplicate',{mode:'merge',picks:{gym:'new',contact:'new',email:'existing'}});
 assert.equal((await snapshot()).total,1);
 const merged=(await db.query('select public.admin_sales_lead_detail($1) v',[lead])).rows[0].v;
 assert.equal(merged.lead.gym,'Alpha New');assert.equal(merged.lead.email,'alpha@fixture.test');assert.ok(merged.activities.some(a=>a.title==='Website demo request merged'));
 assert.equal(merged.follow_ups.length,2);
 await command(lead,'closeLead',{outcome:'Follow up later',reason:'',note:'Later',revisit:'1 month'});
 assert.equal((await snapshot('my',{},0,true)).total,0);
 const closed=(await db.query('select public.admin_sales_lead_detail($1) v',[lead])).rows[0].v;
 assert.equal(closed.follow_ups.filter(f=>f.status==='open').length,1);
 await command(lead,'completeFollowUp',{followUpId:closed.lead.next_follow_up.id});
 assert.equal((await snapshot()).leads[0].stage,'followup');
 await assert.rejects(()=>command(lead,'closeLead',{outcome:'Lost',reason:'Other',note:'',revisit:'2 weeks'}),/note/i);
 await command(lead,'closeLead',{outcome:'Lost',reason:'Pricing',note:'Cost',revisit:'2 weeks'});await command(lead,'reopen');
 await command(lead,'togglePriority');assert.equal((await snapshot()).leads[0].priority,'high');
 await actor(manager);await denied(()=>command(lead,'reassign',{to:other}));assert.equal((await snapshot('team')).total,1);
 await actor(owner);assert.equal((await snapshot('all')).total,2);
 await command(lead,'reassign',{to:manager,note:'Team handoff'});
 await actor(rep);await denied(()=>db.query('select public.admin_sales_lead_detail($1)',[lead]));
 await actor(manager);assert.equal((await snapshot('team')).total,1);
 await actor(owner);
 const slots=(await db.query("select to_char(d,'YYYY-MM-DD') as slot_day from generate_series(current_date+1,current_date+7,interval '1 day') d where extract(dow from d)<>0 limit 1")).rows[0].slot_day;
 const at=slots+'T10:00:00+05:30';
 await command(lead,'saveDemo',{variant:'schedule',mode:'other',scheduledAt:at,note:''});
 await assert.rejects(()=>command(foreign,'saveDemo',{variant:'schedule',mode:'other',scheduledAt:at,note:''}),/unavailable/i);
 await command(lead,'setDemoStatus',{status:'Cancelled'});
 await command(foreign,'saveDemo',{variant:'schedule',mode:'other',scheduledAt:at,note:''});
 await command(foreign,'setDemoStatus',{status:'Completed'});
 await command(lead,'saveDemo',{variant:'suggest',mode:'other',scheduledAt:at,note:'Please confirm'});
 assert.equal((await db.query('select public.admin_sales_lead_detail($1) v',[lead])).rows[0].v.lead.demo_suggested,true);
 await command(lead,'saveDemo',{variant:'confirm',mode:'requested',note:''});
 await command(lead,'setDemoStatus',{status:'Completed'});
 const converted=await command(lead,'convert',{how:'invite',ownerName:'Alpha Owner',email:'invite@fixture.test',plan:'Yearly'});
 assert.ok(converted.invitation.organization_id);
 await assert.rejects(()=>command(lead,'convert',{how:'invite',email:'invite@fixture.test',plan:'Yearly'}),/Converted/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.organizations')).rows[0].n,1);
 await actor(owner);const orgs=(await db.query('select public.admin_sales_organizations($1,\'Alpha\') v',[foreign])).rows[0].v;assert.equal(orgs.length,1);
 await assert.rejects(()=>command(foreign,'convert',{how:'link',organizationId:converted.invitation.organization_id,plan:'Monthly'}),/already linked/);
 const report=await snapshot('all');assert.equal(report.summary.converted,1);assert.equal(report.report.converted,1);assert.equal(report.coverage.reduce((n,c)=>n+c.identified,0),2);
 await actor(owner);await db.query('select public.admin_sales_set_team($1,$2)',[other,'North']);
 // Website → CRM uses a reviewable duplicate, rather than silently changing a closed lead.
 await db.exec("reset role;set role service_role;");
 const requestId='20000000-0000-4000-8000-000000000001';
 const payload={gym:'West Repeat',name:'Owner Repeat',phone:'+919876543211',email:'west@fixture.test',city:'Mumbai',state:'Maharashtra',branches:'1',members:'Under 100',message:'Returning request'};
 const submitted=(await db.query('select public.submit_website_demo($1,$2::jsonb,$3::date,4) v',[requestId,JSON.stringify(payload),slots])).rows[0].v;
 assert.equal(submitted.returning,true);assert.equal(submitted.created,true);
 assert.equal((await db.query('select public.submit_website_demo($1,$2::jsonb,$3::date,4) v',[requestId,JSON.stringify(payload),slots])).rows[0].v.created,false);
 await db.exec('reset role');
 const repeat=(await db.query('select l.* from public.platform_demo_requests r join public.platform_sales_leads l on l.id=r.lead_id where r.id=$1',[requestId])).rows[0];
 assert.equal(repeat.duplicate_of,foreign);assert.equal(repeat.demo_status,'Awaiting confirmation');assert.equal(repeat.stage,'demo_req');
 await actor(owner);await command(repeat.id,'resolveDuplicate',{mode:'separate',why:'A separate branch'});
 assert.equal((await db.query('select public.admin_sales_lead_detail($1) v',[repeat.id])).rows[0].v.lead.possible_existing_lead,false);
 await db.exec('reset role');
 for(const role of ['anon','authenticated']) {assert.equal((await db.query(`select count(*)::int n from pg_class where relname in ('platform_sales_follow_ups','platform_sales_assignments') and has_table_privilege($1,oid,'SELECT,INSERT,UPDATE,DELETE')`,[role])).rows[0].n,0);}
 assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'admin_sales_%' and has_function_privilege('anon',p.oid,'EXECUTE')")).rows[0].n,0);
 assert.ok((await db.query("select count(*)::int n from admin_audit_log where action like 'sales.%'")).rows[0].n>=20);
 await db.exec(await readFile(new URL('../supabase/apply/1022_verify.sql',import.meta.url),'utf8'));
 console.log('CRM SQL checks passed: all commands, scoped roles, denied direct access, reports, booking capacity, merge history and audit. Local fixtures only; no remote database was changed.');
}catch(e){console.error('CRM SQL check failed:',e.message,e.code??'',e.where??'',e.position??'');process.exitCode=1;}finally{await db.close();}
