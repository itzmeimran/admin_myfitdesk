import { BOARD_COLUMNS, type Activity, type ActivityKind, type AssignmentEntry, type CoverageNode, type DemoStatus, type FollowUp, type FollowUpType, type Lead, type LeadStage, type SalesRole, type SalesUser, type Scope } from './model';
import { DAY_MS, IST_TIME_ZONE, istDateKey, istDayDifference } from '@/core/dates/ist';

export type RawFollowUp = { id: string; type: FollowUpType; due_at: string; status: 'open' | 'done' | 'stopped'; note: string };
export type RawLead = {
 id: string; gym: string; contact: string; phone: string; email: string; city: string; state: string; area: string; pin: string;
 branches: string; members: string; software: string; source: string; stage: LeadStage; owner: string | null;
 priority: 'normal' | 'high'; created_at: string; last_contacted_at: string | null; trial_started_at: string | null; trial_ends_at: string | null;
 preferred_at: string | null; demo_status: DemoStatus | null; demo_suggested: boolean; duplicate_of: string | null;
 possible_existing_lead: boolean; organization_id: string | null; converted_at: string | null; converted_by: string | null;
 conversion: { plan: string; org: string; account: string; invitationId: string | null } | null;
 expected_plan: string; lost_reason: string | null; note: string | null; next_follow_up: RawFollowUp | null;
};
export type RawDetail = { lead: RawLead; activities: { id: string; kind: string; title: string; actor_id: string | null; created_at: string; detail: { note?: string } }[];
 follow_ups: RawFollowUp[]; assignments: { to_id: string; actor_id: string | null; created_at: string; note: string }[] };
export type SalesSummary = { total: number; new: number; due: number; overdue: number; demos: number; trials: number; converted: number };
export type Analytics = { kpis: { label: string; value: string; hint: string }[]; stages: [string,number][]; lostReasons: [string,number][];
 followUps: { done: number; overdue: number }; sources: [string,number,number,number][]; people: [string,number,number,number,number][] };
export type RawSnapshot = {
 me: string; role: string; users: { id: string; name: string; role: string; team: string | null; assignable: boolean }[];
 leads: RawLead[]; total: number; summary: SalesSummary; attentionCount: number;
 coverage: { state: string; city: string; area: string; pin: string; identified: number; contacted: number; trials: number; customers: number }[];
 report: { total: number; converted: number; demoCompleted: number; demoTrials: number; trials: number; trialPaid: number; avgDays: number | null;
 stages: { stage: LeadStage; n: number }[]; lostReasons: { reason: string | null; n: number }[]; followUps: { done: number; overdue: number };
 sources: { source: string; leads: number; demos: number; converted: number }[];
 people: { owner: string | null; leads: number; done: number; overdue: number; converted: number }[] };
};
export type SalesInitial = { users: Record<string,SalesUser>; leads: Lead[]; role: SalesRole; meId: string;
 environment?: string;
 canInviteOwner?: boolean;
 total: number; summary: SalesSummary; attentionCount: number; coverage: CoverageNode; analytics: Analytics;
 activities: Record<string,Activity[]>; followUps: Record<string,FollowUp[]>; assignments: Record<string,AssignmentEntry[]>;
 bookDemoUrl: string; error: string | null };
export type SalesRequest = { scope: Scope; team: string; filters: Record<string,string>; query: string; attention: boolean; period: string; offset: number };
export type OrgCandidate = { id: string; name: string; meta: string; status: 'Trial'|'Active'|'Expired'; match: string };

export const dateLabel = (at: string) => new Date(at).toLocaleDateString('en-IN',{timeZone:IST_TIME_ZONE,day:'numeric',month:'short',year:'numeric'});
export const timeLabel = (at: string) => new Date(at).toLocaleTimeString('en-IN',{timeZone:IST_TIME_ZONE,hour:'numeric',minute:'2-digit'}).toUpperCase();
export const whenLabel = (at: string) => `${dateLabel(at)} · ${timeLabel(at)}`;
export function dueState(at: string, now = new Date()): 'overdue'|'today'|'upcoming' {
 return Date.parse(at)<now.getTime()?'overdue':istDateKey(new Date(at))===istDateKey(now)?'today':'upcoming';
}
export function mapLead(l: RawLead,users: Record<string,SalesUser>,now=new Date()): Lead {
 const days=istDayDifference(new Date(l.last_contacted_at??l.created_at),now);
 return { id:l.id,gym:l.gym,contact:l.contact,phone:l.phone,email:l.email,city:l.city,state:l.state,area:l.area,pin:l.pin,
  branches:l.branches,members:l.members,software:l.software,source:l.source,stage:l.stage,owner:l.owner??'unassigned',priority:l.priority,
  createdOn:dateLabel(l.created_at),ageDays:istDayDifference(new Date(l.created_at),now),lastContacted:l.last_contacted_at?(days===0?'Today':`${days} days ago`):'Not yet',lastContactedDays:days,
  next:l.next_follow_up?{label:whenLabel(l.next_follow_up.due_at),due:dueState(l.next_follow_up.due_at,now),type:l.next_follow_up.type}:null,
  demo:l.demo_status&&l.preferred_at?{status:l.demo_status,when:whenLabel(l.preferred_at),scheduledAt:l.preferred_at,suggested:l.demo_suggested}:null,
  trial:l.trial_started_at&&l.trial_ends_at?{start:dateLabel(l.trial_started_at),end:dateLabel(l.trial_ends_at),endsInDays:istDayDifference(now,new Date(l.trial_ends_at))}:null,
  conversion:l.conversion&&l.converted_at?{date:dateLabel(l.converted_at),plan:l.conversion.plan,org:l.conversion.org,account:l.conversion.account,
   subscription:l.conversion.invitationId?'Starts when the owner accepts':'Linked account',by:users[l.converted_by??'']?.name??'Platform admin'}:null,
  lostReason:l.lost_reason,note:l.note,duplicateOf:l.duplicate_of,possibleDuplicate:l.possible_existing_lead,expectedPlan:l.expected_plan };
}
export function mapDetail(d: RawDetail,users: Record<string,SalesUser>) {
 return {lead:mapLead(d.lead,users),activities:d.activities.map(a=>({id:a.id,kind:a.kind as ActivityKind,title:a.title,by:users[a.actor_id??'']?.name??'Website',date:dateLabel(a.created_at),time:timeLabel(a.created_at),note:a.detail.note??('message' in a.detail ? String(a.detail.message??'') : '')})),
  followUps:d.follow_ups.map(f=>({id:f.id,type:f.type,when:whenLabel(f.due_at),status:f.status==='open'?dueState(f.due_at):f.status,note:f.note})),
  assignments:d.assignments.map(a=>({text:`Assigned to ${users[a.to_id]?.name??'Previous salesperson'}`,meta:`${whenLabel(a.created_at)} · by ${users[a.actor_id??'']?.name??'Website'}${a.note?` · ${a.note}`:''}`}))};
}
export function mapSnapshot(raw: RawSnapshot,bookDemoUrl: string): SalesInitial {
 const users: Record<string,SalesUser>={unassigned:{id:'unassigned',name:'Unassigned',initials:'—',title:'Unassigned',team:null,assignable:false}};
 raw.users.forEach(u=>{users[u.id]={...u,initials:u.name.split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase(),title:`${u.role==='platform_owner'?'Platform admin':u.role==='sales_manager'?'Sales manager':'Sales rep'}${u.team?` · ${u.team}`:''}`};});
 raw.leads.forEach(l=>{if(l.owner&&!users[l.owner])users[l.owner]={id:l.owner,name:'Previous salesperson',initials:'—',title:'Previous salesperson',team:null,assignable:false};});
 const root: CoverageNode={name:'India',n:[0,0,0,0],kids:[]};
 raw.coverage.forEach(r=>{const counts=[r.identified,r.contacted,r.trials,r.customers]; let node=root;
  counts.forEach((n,i)=>node.n[i]+=n);
  [r.state,r.city,r.area,r.pin].forEach((name,index)=>{name=name||'Unspecified'; node.kids??=[]; let child=node.kids.find(k=>k.name===name);
   if(!child){child={name,n:[0,0,0,0],...(index<3?{kids:[]}: {})};node.kids.push(child);} node=child;counts.forEach((n,i)=>node.n[i]+=n);});});
 const r=raw.report; const pct=(a:number,b:number)=>b?`${Math.round(a/b*1000)/10}%`:'—';
 return {users,leads:raw.leads.map(l=>mapLead(l,users)),role:raw.role==='platform_owner'?'admin':raw.role==='sales_manager'?'manager':'rep',meId:raw.me,
  total:raw.total,summary:raw.summary,attentionCount:raw.attentionCount,coverage:root,activities:{},followUps:{},assignments:{},bookDemoUrl,error:null,
  analytics:{kpis:[{label:'Conversion rate',value:pct(r.converted,r.total),hint:`${r.converted} of ${r.total} leads`},
   {label:'Demo → trial',value:pct(r.demoTrials,r.demoCompleted),hint:'Of completed demos'}, {label:'Trial → paid',value:pct(r.trialPaid,r.trials),hint:'Active paid accounts from trials'},
   {label:'Avg. time to convert',value:r.avgDays===null?'—':`${r.avgDays} days`,hint:'First contact to conversion'}],
   stages:BOARD_COLUMNS.map(c=>[c.label,r.stages.filter(s=>c.key==='closed'?['later','notint','lost'].includes(s.stage):s.stage===c.key).reduce((n,s)=>n+s.n,0)]),
   lostReasons:r.lostReasons.map(s=>[s.reason??'Unspecified',s.n]),followUps:r.followUps,sources:r.sources.map(s=>[s.source,s.leads,s.demos,s.converted]),
   people:r.people.map(p=>[p.owner??'unassigned',p.leads,p.done,p.overdue,p.converted])}};
}
export function emptySales(meId:string,role:SalesRole,bookDemoUrl:string,error:string):SalesInitial {
 const raw:RawSnapshot={me:meId,role:role==='admin'?'platform_owner':role==='manager'?'sales_manager':'sales_rep',users:[{id:meId,name:'Sales account',role,team:null,assignable:false}],leads:[],total:0,summary:{total:0,new:0,due:0,overdue:0,demos:0,trials:0,converted:0},attentionCount:0,coverage:[],report:{total:0,converted:0,demoCompleted:0,demoTrials:0,trials:0,trialPaid:0,avgDays:null,stages:[],lostReasons:[],followUps:{done:0,overdue:0},sources:[],people:[]}};
 return {...mapSnapshot(raw,bookDemoUrl),error};
}
// Explicit timestamp values; never parse formatted display labels for a write.
export function scheduledIso(date:string,time:string):string {
 const m=time.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
 if(!m||Number(m[1])<1||Number(m[1])>12||Number(m[2])>59||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Choose a date and time');
 const hour=(Number(m[1])%12)+(m[3]==='PM'?12:0);
 const at=new Date(`${date}T${String(hour).padStart(2,'0')}:${m[2]}:00+05:30`);
 if(!Number.isFinite(at.getTime())||istDateKey(at)!==date)throw new Error('Invalid schedule');return at.toISOString();
}
export function revisitLabel(months:number,now=new Date()):string {
 const key=istDateKey(now);const d=new Date(`${key}T00:00:00Z`);
 if(months===0)d.setUTCDate(d.getUTCDate()+14);else {const day=d.getUTCDate(); d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));}
 return dateLabel(new Date(d.getTime()+DAY_MS/2).toISOString());
}
