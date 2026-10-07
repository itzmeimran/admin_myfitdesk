'use server';

import { z } from 'zod';
import { assertPermission, getAdminAccess } from '@/core/auth/access';
import { getActiveAdminEnvironment } from '@/core/env/active-environment';
import { createClient } from '@/core/db/server-client';
import { loose } from '@/core/db/loose-client';
import { revalidatePath } from 'next/cache';
import { isEmailConfigured } from '@/core/config/email';
import { tenantAppOrigin } from '@/core/config/tenant-app';
import { createServiceClient } from '@/core/db/service-client';
import { getPlatformSettingsOrFallback } from '@/features/settings/platform-settings';
import { gymOwnerInviteEmail } from '@/core/email/templates';
import { sendSystemEmail } from '@/core/email/system-email';
import { mapSnapshot, dateLabel, emptySales, type RawSnapshot, type RawDetail, type SalesRequest, type OrgCandidate, type SalesInitial } from '@/features/sales/data';
import { manualLeadSchema } from '@/features/sales/manual-lead';

const uuid=z.string().uuid();
const note=z.string().trim().max(5000).default('');
const instant=z.iso.datetime({offset:true});
const commandSchema=z.discriminatedUnion('command',[
 z.object({command:z.literal('moveLead'),input:z.object({stage:z.enum(['new','contacted','interested','demo_req','trial','followup'])})}),
 z.object({command:z.literal('logActivity'),input:z.object({type:z.enum(['Call','WhatsApp','Email','Meeting','Note']),note})}),
 z.object({command:z.literal('scheduleFollowUp'),input:z.object({type:z.enum(['Call','WhatsApp','Email','Meeting','Demo']),dueAt:instant,note})}),
 z.object({command:z.literal('completeFollowUp'),input:z.object({followUpId:uuid})}),
 z.object({command:z.literal('saveDemo'),input:z.object({variant:z.enum(['confirm','suggest','schedule','reschedule']),mode:z.enum(['requested','other']),scheduledAt:instant.optional(),note})}),
 z.object({command:z.literal('setDemoStatus'),input:z.object({status:z.enum(['Completed','No show','Cancelled'])})}),
 z.object({command:z.literal('reassign'),input:z.object({to:uuid,note})}),
 z.object({command:z.literal('convert'),input:z.object({how:z.enum(['link','invite','paid']),organizationId:uuid.optional(),ownerName:z.string().trim().min(1).max(100).optional(),email:z.email().optional(),plan:z.string().max(160)})}),
 z.object({command:z.literal('closeLead'),input:z.object({outcome:z.enum(['Lost','Not interested','Follow up later']),reason:z.string().max(100),note,revisit:z.enum(['2 weeks','1 month','3 months'])})}),
 z.object({command:z.literal('resolveDuplicate'),input:z.union([z.object({mode:z.literal('separate'),why:z.string().trim().min(1).max(5000)}),z.object({mode:z.literal('merge'),picks:z.object({gym:z.enum(['existing','new']).optional(),contact:z.enum(['existing','new']).optional(),email:z.enum(['existing','new']).optional()})})])}),
 z.object({command:z.literal('togglePriority'),input:z.object({})}),z.object({command:z.literal('reopen'),input:z.object({})}),
]);
const readSchema=z.object({scope:z.enum(['my','team','all']),team:z.string().max(80),filters:z.record(z.string(),z.string().max(160)),query:z.string().max(160),attention:z.boolean(),period:z.enum(['30','90','year']),offset:z.number().int().min(0).max(10000000)});
const bookDemoUrl=()=>`${(process.env.MARKETING_ORIGIN||'https://www.myfitdesk.app').replace(/\/$/,'')}/book-a-demo`;

export async function loadSales(request:SalesRequest):Promise<{data:SalesInitial|null;error:string|null}> {
 await assertPermission('sales.view');
 const parsed=readSchema.safeParse(request);if(!parsed.success)return {data:null,error:'Invalid sales filters'};
 const p=parsed.data; const db=await createClient();
 const {data,error}=await loose(db).rpc('admin_sales_snapshot',{p_scope:p.scope,p_team:p.team||null,p_filters:p.filters,p_search:p.query,p_attention:p.attention,p_period:p.period,p_limit:100,p_offset:p.offset});
 if(error)return {data:null,error:error.code==='PGRST202'?'CRM database setup is pending. Apply migrations 1021 and 1022 in this environment.':error.message};
 const canManageSales=(await getAdminAccess())?.permissions.includes('sales.manage')??false;
 return {data:{...mapSnapshot(data as RawSnapshot,bookDemoUrl()),environment:await getActiveAdminEnvironment(),canInviteOwner:canManageSales,canManageSales},error:null};
}
export async function initialSales():Promise<SalesInitial> {
 await assertPermission('sales.view');const access=await getAdminAccess();
 const role=access?.role==='platform_owner'?'admin':access?.role==='sales_manager'?'manager':'rep';
 const {data,error}=await loadSales({scope:role==='admin'?'all':role==='manager'?'team':'my',team:'',filters:{},query:'',attention:false,period:'90',offset:0});
 return data??{...emptySales(access!.userId,role,bookDemoUrl(),error??'Unable to load CRM'),environment:await getActiveAdminEnvironment()};
}
export async function loadSalesDetail(id:string) {
 await assertPermission('sales.view');if(!uuid.safeParse(id).success)return {data:null,error:'Invalid lead'};
 const {data,error}=await loose(await createClient()).rpc('admin_sales_lead_detail',{p_id:id});
 return {data:error?null:data as RawDetail,error:error?.message??null};
}
export async function searchSalesOrganizations(leadId:string,search:string):Promise<{data:OrgCandidate[];error:string|null}> {
 await assertPermission('sales.view');if(!uuid.safeParse(leadId).success||search.length>160)return {data:[],error:'Invalid search'};
 const {data,error}=await loose(await createClient()).rpc('admin_sales_organizations',{p_lead_id:leadId,p_search:search});
 if(error)return {data:[],error:error.message};
 return {data:(data as {id:string;name:string;city:string|null;created_at:string;status:OrgCandidate['status'];phone_match:boolean}[]).map(o=>({id:o.id,name:o.name,status:o.status,meta:`${o.city??''} · signed up ${dateLabel(o.created_at)}`,match:o.phone_match?'Owner phone matches this lead':''})),error:null};
}
export async function createSalesLead(requestId:string,input:unknown) {
 await assertPermission('sales.manage');
 const parsed=manualLeadSchema.safeParse(input);
 if(!uuid.safeParse(requestId).success||!parsed.success)return {error:parsed.success?'Invalid request':parsed.error.issues[0]?.message??'Check the lead details',leadId:null,existing:false};
 const {data,error}=await loose(await createClient()).rpc('admin_sales_create_lead',{p_id:requestId,p_input:parsed.data});
 if(error)return {error:error.code==='PGRST202'?'Manual lead setup is pending. Apply migration 1025 in this environment.':error.message,leadId:null,existing:false};
 revalidatePath('/admin','layout');
 const result=data as {leadId:string;existing:boolean};
 return {error:null,...result};
}
export async function runSalesCommand(id:string,command:string,input:unknown) {
 await assertPermission('sales.manage');
 if(command==='reassign')await assertPermission('sales.reassign');
 const parsed=commandSchema.safeParse({command,input});if(!uuid.safeParse(id).success||!parsed.success)return {error:parsed.success?'Invalid lead':parsed.error.issues[0]?.message??'Invalid input',leadId:id,warning:null};
 const db=await createClient();const {data,error}=await loose(db).rpc('admin_sales_command',{p_id:id,p_command:parsed.data.command,p_input:parsed.data.input});
 if(error)return {error:error.message,leadId:id,warning:null};
 const result=data as {leadId:string;invitation:{email:string;organization_id:string;invitation_id:string}|null};
 let warning:string|null=null;
 if(result.invitation) {
  // Same 1012 invitation record and /invite/accept delivery as the gyms flow.
  if(!isEmailConfigured())warning='Gym created. Email is not configured; resend the invitation from the gym page when configured.';
  else try {
   const origin=tenantAppOrigin(await getActiveAdminEnvironment());
   const service=await createServiceClient();
   const {data:link,error:linkError}=await service.auth.admin.generateLink({type:'invite',email:result.invitation.email,
    options:{redirectTo:`${origin}/auth/confirm?type=invite&next=${encodeURIComponent('/invite/accept')}`}});
   if(linkError||!link)throw new Error(linkError?.message??'Unable to create invitation link');
   const detail=await loose(db).rpc('admin_sales_lead_detail',{p_id:result.leadId});
   const lead=(detail.data as RawDetail)?.lead;
   const confirmationUrl=`${origin}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=invite&next=${encodeURIComponent('/invite/accept')}`;
   const mail=gymOwnerInviteEmail({gymName:lead?.gym??'Your gym',ownerFirstName:lead?.contact??'',confirmationUrl,branding:await getPlatformSettingsOrFallback(db)});
   const sent=await sendSystemEmail({to:result.invitation.email,subject:mail.subject,html:mail.html,text:mail.text});
   if(!sent.ok)throw new Error(sent.error);
  } catch {warning='Gym created, but the invitation email was not sent. Use Resend invitation from the gym page.';}
 }
 revalidatePath('/admin','layout');
 return {error:null,leadId:result.leadId,warning};
}
