// Exercise the actual migration in isolated PostgreSQL. No remote writes or messages.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../FitDeskApp/node_modules/@electric-sql/pglite/dist/index.js';
import { citext } from '../../FitDeskApp/node_modules/@electric-sql/pglite/dist/contrib/citext.js';

const db = new PGlite({ extensions: { citext } });
const admin = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
async function actor(id, role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`);
}
async function rpc(name, args = []) {
  return (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
}
async function invitation(phone) {
  await actor(admin);
  return rpc('admin_create_gym_owner_phone_invitation', ['Fixture gym', 'First', 'Last', phone]);
}
async function provision(invite, userId) {
  await db.exec('reset role');
  const { email } = (await db.query('select email from staff_invitations where id=$1', [invite.invitation_id])).rows[0];
  await db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)', [userId, email, JSON.stringify({ gym_owner_phone_invitation_id: invite.invitation_id })]);
  await actor('', 'service_role');
  assert.equal(await rpc('link_gym_owner_phone_identity', [invite.invitation_id]), userId);
  return email;
}
try {
  await db.exec(`create extension citext;
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema app;
    grant usage on schema public,auth,app to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email citext,raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function app.is_platform_admin() returns boolean language sql stable as $$select auth.uid()='${admin}'::uuid$$;
    create function app.has_platform_permission(p text) returns boolean language sql stable as $$select coalesce(auth.uid()='${admin}'::uuid,false)$$;
    create table organizations(id uuid primary key default gen_random_uuid(),gym_code text default 'GYM01',
      slug citext,name text,contact_email citext,contact_phone text,address_line text,city text,state text,country text,
      postal_code text,default_timezone text,default_currency text);
    create table gyms(id uuid primary key default gen_random_uuid(),organization_id uuid,slug text,name text);
    create table branches(id uuid primary key default gen_random_uuid(),organization_id uuid,gym_id uuid,name text);
    create table platform_packages(id uuid primary key,status text,duration_days integer);
    create table organization_subscriptions(organization_id uuid primary key,package_id uuid,status text,
      current_period_start timestamptz,current_period_end timestamptz,cancelled_at timestamptz);
    create function app.default_subscription() returns trigger language plpgsql as $$begin
      insert into organization_subscriptions values(new.id,null,'trialing',now(),now()+interval '14 days',null);return new;end$$;
    create trigger default_subscription after insert on organizations for each row execute function app.default_subscription();
    create table staff_memberships(id uuid primary key default gen_random_uuid(),organization_id uuid,user_id uuid,
      branch_id uuid,role text,email citext not null,first_name text,last_name text,phone_e164 text,access_status text default 'active',
      invited_at timestamptz,activated_at timestamptz,must_change_password boolean,deletion_requested_at timestamptz,
      unique(organization_id,user_id));
    create table staff_invitations(id uuid primary key default gen_random_uuid(),organization_id uuid,
      organization_name_snapshot text,branch_id uuid,email citext not null,role text,status text default 'pending',
      invited_by uuid,expires_at timestamptz default now()+interval '7 days',created_at timestamptz default now(),
      accepted_at timestamptz,revoked_at timestamptz,email_verified_at timestamptz,invited_first_name text,
      invited_last_name text,invited_phone text,resend_count integer default 0,last_resent_at timestamptz);
    create table admin_audit_log(admin_id uuid,action text,target_organization_id uuid,detail jsonb);
    create table auth_otp_codes(id uuid primary key default gen_random_uuid(),user_id uuid,phone_number text,
      otp_hash text,expires_at timestamptz,max_attempts integer,consumed_at timestamptz);
    insert into auth.users(id,email) values('${admin}','admin@fixture.test');
  `);
  const historical = await readFile(new URL('../supabase/migrations/1012_gym_owner_onboarding.sql', import.meta.url), 'utf8');
  const create = historical.match(/create or replace function public\.admin_create_gym_owner_invitation\([\s\S]*?\$\$;/)[0];
  await db.exec(create.replace('public.admin_create_gym_owner_invitation', 'app.sales_create_gym_owner_invitation'));
  await db.exec(await readFile(new URL('../supabase/migrations/1026_gym_owner_phone_otp.sql', import.meta.url), 'utf8'));

  await actor(outsider);
  await assert.rejects(() => rpc('admin_create_gym_owner_phone_invitation', ['Unauthorized','First','','+919876543210']), /authorized/);
  await assert.rejects(() => rpc('complete_phone_login', [owner,'+919876543210']), /permission denied/);
  await actor(admin);
  await assert.rejects(() => rpc('admin_create_gym_owner_phone_invitation', ['Invalid','First','','123']), /valid mobile/);
  const invite = await invitation('+919876543210');
  assert.equal(invite.email, null);
  assert.equal(invite.invitation_channel, 'whatsapp');
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from staff_memberships')).rows[0].n, 0);
  await assert.rejects(() => db.query("insert into staff_memberships(organization_id,user_id,role,email,phone_e164) values($1,$2,'staff','other@fixture.test',$3)",
    [invite.organization_id,outsider,'+919876543210']), /reserved for a pending/);
  await actor(admin);
  assert.equal((await rpc('admin_get_gym_owner_invitation', [invite.organization_id])).email, null);
  await assert.rejects(() => invitation('+919876543210'), /pending owner invitation/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from organizations')).rows[0].n, 1, 'Duplicate must not leave a second gym');
  assert.equal((await db.query('select contact_email from organizations where id=$1', [invite.organization_id])).rows[0].contact_email, null);
  await provision(invite, owner);
  assert.equal(await rpc('complete_phone_login', [owner,'+919876543211']), false);
  assert.equal(await rpc('complete_phone_login', [outsider,'+919876543210']), false);
  assert.equal(await rpc('complete_phone_login', [owner,'+919876543210']), true);
  assert.equal(await rpc('complete_phone_login', [owner,'+919876543210']), true, 'Future phone login reuses membership');
  await db.exec('reset role');
  const membership = (await db.query('select * from staff_memberships')).rows[0];
  assert.equal(membership.role,'owner'); assert.equal(membership.access_status,'active');
  assert.equal(membership.must_change_password,false);
  assert.equal((await db.query('select count(*)::int n from staff_memberships')).rows[0].n,1);
  await actor(admin);
  const status = await rpc('admin_get_gym_owner_invitation',[invite.organization_id]);
  assert.equal(status.effective_status,'active'); assert.ok(status.phone_verified_at);
  await assert.rejects(() => rpc('admin_revoke_gym_owner_invitation',[invite.invitation_id]), /pending/);
  await assert.rejects(() => rpc('admin_resend_gym_owner_invitation',[invite.invitation_id]), /pending/);
  await assert.rejects(() => invitation('+919876543210'), /already belongs/);
  await db.exec("reset role; update staff_memberships set access_status='disabled';");
  await actor('', 'service_role');
  assert.equal(await rpc('complete_phone_login',[owner,'+919876543210']),false);

  const expired = await invitation('+919876543211');
  await provision(expired, outsider);
  await db.exec("reset role");
  await db.query("update staff_invitations set expires_at=now()-interval '1 minute' where id=$1",[expired.invitation_id]);
  await actor('', 'service_role');
  assert.equal(await rpc('complete_phone_login',[outsider,'+919876543211']),false);
  await actor(admin);
  const resent = await rpc('admin_resend_gym_owner_invitation',[expired.invitation_id]);
  assert.equal(resent.invitation_channel,'whatsapp'); assert.equal(resent.email,null);
  await actor('', 'service_role');
  await rpc('issue_auth_otp',[outsider,'+919876543211','hash',new Date(Date.now()+60000).toISOString(),5]);
  await actor(admin);
  await rpc('admin_revoke_gym_owner_invitation',[expired.invitation_id]);
  await actor('', 'service_role');
  assert.equal(await rpc('complete_phone_login',[outsider,'+919876543211']),false);
  await db.exec('reset role');
  assert.ok((await db.query('select consumed_at from auth_otp_codes')).rows[0].consumed_at);
  const renewed = await invitation('+919876543211');
  assert.notEqual(renewed.invitation_id,expired.invitation_id);
  await actor(admin);
  const emailInvite = (await db.query("select app.sales_create_gym_owner_invitation('Email gym','Email','Owner','real@fixture.test') value")).rows[0].value;
  assert.equal((await rpc('admin_get_gym_owner_invitation',[emailInvite.organization_id])).email,'real@fixture.test');
  await assert.rejects(() => rpc('admin_get_owner_phone_delivery',[emailInvite.invitation_id]), /no longer pending/);
  await db.exec('reset role');
  for (const role of ['anon','authenticated']) {
    for (const fn of ['complete_phone_login(uuid,text)','link_gym_owner_phone_identity(uuid)']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed',[role,fn,'EXECUTE'])).rows[0].allowed,false);
    }
  }
  console.log('Owner phone SQL PASS: permissions, pending enrollment, duplicates, verification, passwordless repeat login, disabled access, expiry, resend, revoke, re-invite and email compatibility. Isolated fixtures only.');
} finally { await db.close(); }
