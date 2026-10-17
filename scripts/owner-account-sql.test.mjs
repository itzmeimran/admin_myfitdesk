// Isolated PostgreSQL; no remote connections or messages.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.OWNER_PGLITE_MODULE ?? '../../FitDeskApp/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const org = '00000000-0000-4000-8000-000000000001';
const staff = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000003';
const other = '00000000-0000-4000-8000-000000000004';
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema app;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
  create function app.has_platform_permission(p text) returns boolean language sql stable as $$select coalesce(current_setting('test.permission',true)='all' or current_setting('test.permission',true)=p,false)$$;
  create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
  create table staff_memberships(id uuid primary key,organization_id uuid,user_id uuid,role text,first_name text,last_name text,email text,phone_e164 text,access_status text,deletion_requested_at timestamptz);
  create table staff_invitations(organization_id uuid,role text,invitation_channel text,status text,invited_phone text,phone_verified_at timestamptz,email text);
  create table admin_audit_log(admin_id uuid,action text,target_organization_id uuid,detail jsonb);
  insert into auth.users values('${user}','owner@example.com','',now(),null);
  insert into staff_memberships values('${staff}','${org}','${user}','owner','Wrong','Name','owner@example.com','+919999999999','active',null);
  select set_config('test.actor','${other}',false),set_config('test.permission','all',false);
`);
await db.exec(await readFile(new URL('../supabase/migrations/1033_admin_owner_profile.sql', import.meta.url), 'utf8'));
async function account(oid=org, sid=staff) {
  return (await db.query('select public.admin_gym_owner_account($1,$2) as value',[oid,sid])).rows[0].value;
}
async function rename(first='Syed Noor',last='Ahamed',oid=org,sid=staff) {
  return db.query('select public.admin_update_gym_owner_name($1,$2,$3,$4)',[oid,sid,first,last]);
}
let value = await account();
assert.equal(value.email_verified,true,'verified owner email is independent of optional gym contact email');
assert.equal(value.phone_verified,false,'OTP availability is separate from recorded verification');
assert.equal(value.whatsapp_otp_available,true,'native auth phone is not required for custom WhatsApp OTP');
await db.exec(`select set_config('test.permission','gyms.view',false)`);
await assert.rejects(rename(),/Not authorized/);
assert.equal((await account()).email_verified,true);
await db.exec(`select set_config('test.permission','all',false)`);
await assert.rejects(rename('Valid','Name',other),/Owner not found/);
await assert.rejects(rename('Valid','Name',org,other),/Owner not found/);
await assert.rejects(rename('   '),/Enter an owner first name/);
await assert.rejects(rename('x'.repeat(101)),/100 characters/);
await rename(' Syed Noor ',' Ahamed ');
value = await account();
assert.equal(value.first_name+' '+value.last_name,'Syed Noor Ahamed');
assert.equal((await db.query('select count(*)::int n from admin_audit_log')).rows[0].n,1);
await rename();
assert.equal((await db.query('select count(*)::int n from admin_audit_log')).rows[0].n,1,'no duplicate audit for unchanged name');
await rename('Single','');
assert.equal((await account()).last_name,'');
await db.exec(`alter table admin_audit_log add constraint reject_test check(action <> 'owner.update_name') not valid`);
await assert.rejects(rename('Rollback','Test'),/reject_test/);
assert.equal((await account()).first_name,'Single','audit failure rolls the name back atomically');
await db.exec(`alter table admin_audit_log drop constraint reject_test;
  update auth.users set phone='919999999999',phone_confirmed_at=now();`);
assert.equal((await account()).phone_verified,true);
await db.exec(`update auth.users set phone='918888888888';`);
assert.equal((await account()).phone_verified,false,'verification of a different phone is not inherited');
await db.exec(`insert into staff_invitations values('${org}','owner','whatsapp','accepted','+919999999999',now(),'someone@example.com');`);
assert.equal((await account()).phone_verified,false,'another identity invitation is not proof');
await db.exec(`update staff_invitations set email='owner@example.com';`);
assert.equal((await account()).phone_verified,true);
await db.exec(`update auth.users set email='phone@staff.myfitdesk.internal';`);
value = await account();
assert.equal(value.email,null);
assert.equal(value.email_verified,false,'internal login aliases are not verified contact emails');
await db.exec(`insert into staff_memberships values('${other}','${other}','${other}','owner','Other','','other@example.com','+919999999999','active',null);`);
assert.equal((await account()).whatsapp_otp_available,false,'ambiguous phone cannot issue a login OTP');
await db.exec(`delete from staff_memberships where id='${other}'; update staff_memberships set access_status='disabled';`);
assert.equal((await account()).whatsapp_otp_available,false);
await db.exec(`update staff_memberships set role='trainer';`);
await assert.rejects(account(),/Owner not found/);
await assert.rejects(rename(),/Owner not found/);
await db.exec(`select set_config('test.permission','none',false)`);
await assert.rejects(account(),/Not authorized/);
await db.exec(`select set_config('test.permission','all',false),set_config('test.actor','',false)`);
await assert.rejects(account(),/Not authorized/);
const acl = await db.query(`select has_function_privilege('anon','public.admin_gym_owner_account(uuid,uuid)','EXECUTE') as anon_read,
  has_function_privilege('anon','public.admin_update_gym_owner_name(uuid,uuid,text,text)','EXECUTE') as anon_write,
  has_function_privilege('authenticated','public.admin_update_gym_owner_name(uuid,uuid,text,text)','EXECUTE') as admin_write`);
assert.deepEqual(acl.rows[0],{anon_read:false,anon_write:false,admin_write:true});
console.log('Owner account SQL passed: verification, custom OTP availability, tenant/role isolation, input checks, no-op and atomic audit.');
await db.close();
