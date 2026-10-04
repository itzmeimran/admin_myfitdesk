'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { loadSales, loadSalesDetail, runSalesCommand } from '@/app/admin/sales/actions';
import { mapDetail, scheduledIso, type SalesInitial, type SalesRequest } from './data';
import { EMPTY_FILTERS, ROLE_CONFIG, type DemoStatus, type FollowUpType, type LeadFilters, type LeadStage, type SalesUserId, type Scope } from './model';
export type { SalesInitial } from './data';
export type DataState='data'|'loading'|'empty'|'error';
export type ModalState=
 |{kind:'filters'}|{kind:'stages'}|{kind:'more';id:string}|{kind:'activity';id:string;tab:'log'|'followup'}
 |{kind:'demo';id:string;variant:'confirm'|'suggest'|'schedule'|'reschedule'}|{kind:'reassign';id:string}|{kind:'convert';id:string}
 |{kind:'lost';id:string;outcome:'Lost'|'Not interested'|'Follow up later'}|{kind:'duplicate';id:string};
export type DrawerTab='overview'|'activity'|'follow';
export type DemoInput={variant:'confirm'|'suggest'|'schedule'|'reschedule';mode:'requested'|'other';date:string;time:string;note:string};
export type ConvertInput={how:'link'|'invite';organizationId?:string;ownerName:string;plan:string;email:string};
export type CloseInput={outcome:'Lost'|'Not interested'|'Follow up later';reason:string;note:string;revisit:string};
export type DuplicateInput={mode:'separate';why:string}|{mode:'merge';picks:Partial<Record<'gym'|'contact'|'email','existing'|'new'>>};
export type SalesCommands={
 moveLead:(id:string,stage:LeadStage|'closed')=>void;
 logActivity:(id:string,input:{type:'Call'|'WhatsApp'|'Email'|'Meeting'|'Note';note:string})=>void;
 scheduleFollowUp:(id:string,input:{type:FollowUpType;date:string;time:string;note:string})=>void;
 completeFollowUp:(id:string,followUpId:string)=>void;saveDemo:(id:string,input:DemoInput)=>void;
 setDemoStatus:(id:string,status:Extract<DemoStatus,'Completed'|'No show'|'Cancelled'>)=>void;
 reassign:(id:string,to:SalesUserId,note:string)=>void;convert:(id:string,input:ConvertInput)=>void;
 closeLead:(id:string,input:CloseInput)=>void;resolveDuplicate:(id:string,input:DuplicateInput)=>void;
 togglePriority:(id:string)=>void;reopen:(id:string)=>void;
};
function useStore(initial:SalesInitial,attentionView:boolean) {
 const toast=useToast();const router=useRouter();const [snapshot,setSnapshot]=useState(initial);
 const [scope,setScope]=useState<Scope>(ROLE_CONFIG[initial.role].defaultScope);
 const [team,setTeam]=useState(initial.users[initial.meId]?.team??'');
 const [query,setQuery]=useState('');const [filters,setFilters]=useState<LeadFilters>(EMPTY_FILTERS);
 const [attentionOnly,setAttentionOnly]=useState(false);const [period,setPeriod]=useState('90');
 const [mobileStage,setMobileStage]=useState(3);const [openId,setOpenId]=useState<string|null>(null);
 const [drawerTab,setDrawerTab]=useState<DrawerTab>('overview');const [modal,setModal]=useState<ModalState|null>(null);
 const [detailLeads,setDetailLeads]=useState<Record<string,SalesInitial['leads'][number]>>({});
 const [busy,startTransition]=useTransition();const writing=useRef(false);
 const [loading,setLoading]=useState(false);const [error,setError]=useState(initial.error);const [mutationError,setMutationError]=useState<string|null>(null);
 const generation=useRef(0);const detailGeneration=useRef(0);
 const request=useMemo<SalesRequest>(()=>({scope,team,filters,query,attention:attentionOnly||attentionView,period,offset:0}),[scope,team,filters,query,attentionOnly,attentionView,period]);
 const currentRequest=useRef(request);
 useEffect(()=>{currentRequest.current=request;},[request]);
 const getLead=useCallback((id:string)=>snapshot.leads.find(l=>l.id===id)??detailLeads[id],[snapshot.leads,detailLeads]);
 const refresh=useCallback(async(append=false)=>{
  const gen=++generation.current;setLoading(true);
  try{const result=await loadSales({...currentRequest.current,offset:append?snapshot.leads.length:0});
   if(gen!==generation.current)return;
   if(result.error||!result.data){setError(result.error??'Unable to load leads');return;}
   const next=result.data;
   setSnapshot(prev=>({...next,leads:append?[...prev.leads,...next.leads.filter(l=>!prev.leads.some(p=>p.id===l.id))]:next.leads,
    activities:prev.activities,followUps:prev.followUps,assignments:prev.assignments}));setError(null);
  }catch{if(gen===generation.current)setError('Unable to load leads. Try again.');}
  finally{if(gen===generation.current)setLoading(false);}
 },[snapshot.leads.length]);
 const refreshRef=useRef(refresh);
 useEffect(()=>{refreshRef.current=refresh;},[refresh]);
 useEffect(()=>{const timer=setTimeout(()=>{startTransition(()=>{void refreshRef.current();});},250);return()=>{clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- this numeric generation intentionally invalidates any outstanding response
  generation.current++;
 };},[request]);
 useEffect(()=>{const timer=setInterval(()=>{startTransition(()=>{void refreshRef.current();});},60000);return()=>clearInterval(timer);},[]);
 const detail=useCallback(async(id:string)=>{
  const result=await loadSalesDetail(id);if(!result.data)throw new Error(result.error??'Lead could not load');
  const mapped=mapDetail(result.data,snapshot.users);
  setDetailLeads(prev=>({...prev,[id]:mapped.lead}));
  setSnapshot(prev=>({...prev,leads:prev.leads.map(l=>l.id===id?mapped.lead:l),activities:{...prev.activities,[id]:mapped.activities},followUps:{...prev.followUps,[id]:mapped.followUps},assignments:{...prev.assignments,[id]:mapped.assignments}}));
  if(mapped.lead.duplicateOf){const other=await loadSalesDetail(mapped.lead.duplicateOf);if(other.data){const matching=mapDetail(other.data,snapshot.users);setDetailLeads(prev=>({...prev,[matching.lead.id]:matching.lead}));}}
 },[snapshot.users]);
 const openLead=useCallback((id:string)=>{const gen=++detailGeneration.current;startTransition(async()=>{try{await detail(id);if(gen===detailGeneration.current){setOpenId(id);setDrawerTab('overview');}}catch(e){toast.error(e instanceof Error?e.message:'Lead could not load');}});},[detail,toast]);
 const openModal=useCallback((m:ModalState)=>{setMutationError(null);if('id'in m){const gen=++detailGeneration.current;startTransition(async()=>{try{await detail(m.id);if(gen===detailGeneration.current)setModal(m);}catch(e){toast.error(e instanceof Error?e.message:'Lead could not load');}});}else setModal(m);},[detail,toast]);
 const execute=useCallback((id:string,command:string,input:unknown)=>{
  if(writing.current)return;writing.current=true;setMutationError(null);
  startTransition(async()=>{try{
   const result=await runSalesCommand(id,command,input);
   if(result.error){setMutationError(result.error);toast.error(result.error);return;}
   setModal(null);await refreshRef.current();
   if(openId){try{await detail(result.leadId);setOpenId(result.leadId);}catch{setOpenId(null);}}
   toast.success('Saved');if(result.warning)toast.error(result.warning);router.refresh();
  }catch(e){const message=e instanceof Error?e.message:'Unable to save';setMutationError(message);toast.error(message);}
  finally{writing.current=false;}});
 },[detail,openId,router,toast]);
 const commands=useMemo<SalesCommands>(()=>({
  moveLead(id,stage){const l=getLead(id);if(!l||l.stage===stage)return;
   if(stage==='converted')return openModal({kind:'convert',id});
   if(['closed','later','notint','lost'].includes(stage))return openModal({kind:'lost',id,outcome:stage==='later'?'Follow up later':stage==='notint'?'Not interested':'Lost'});
   if(stage==='demo_sched')return openModal({kind:'demo',id,variant:l.demo?'confirm':'schedule'});
   execute(id,'moveLead',{stage});},
  logActivity:(id,input)=>execute(id,'logActivity',input),
  scheduleFollowUp:(id,{date,time,...input})=>execute(id,'scheduleFollowUp',{...input,dueAt:scheduledIso(date,time)}),
  completeFollowUp:(id,followUpId)=>execute(id,'completeFollowUp',{followUpId}),
  saveDemo:(id,{date,time,...input})=>execute(id,'saveDemo',{...input,...(input.variant==='confirm'&&input.mode==='requested'?{}:{scheduledAt:scheduledIso(date,time)})}),
  setDemoStatus:(id,status)=>execute(id,'setDemoStatus',{status}),reassign:(id,to,note)=>execute(id,'reassign',{to,note}),
  convert:(id,{how,organizationId,ownerName,plan,email})=>execute(id,'convert',{how,organizationId,ownerName,plan,email:how==='invite'?email:undefined}),
  closeLead:(id,input)=>execute(id,'closeLead',input),resolveDuplicate:(id,input)=>execute(id,'resolveDuplicate',input),
  togglePriority:id=>execute(id,'togglePriority',{}),reopen:id=>execute(id,'reopen',{}),
 }),[execute,getLead,openModal]);
 const dataState:DataState=error?'error':loading?'loading':snapshot.total===0?'empty':'data';
 return {...snapshot,role:initial.role,me:snapshot.users[initial.meId],dataState,error,mutationError,busy,
  scope,setScope,team,setTeam,query,setQuery,filters,patchFilters:(p:Partial<LeadFilters>)=>setFilters(f=>({...f,...p})),
  clearFilters:()=>{setFilters(EMPTY_FILTERS);setQuery('');setAttentionOnly(false);},attentionOnly,setAttentionOnly,period,setPeriod,
  mobileStage,setMobileStage,getLead,openId,drawerTab,setDrawerTab,openLead,closeDrawer:()=>{detailGeneration.current++;setOpenId(null);},
  modal,openModal,closeModal:()=>{if(!writing.current){detailGeneration.current++;setModal(null);}},commands,
  retry:()=>startTransition(()=>{void refreshRef.current();}),loadMore:()=>startTransition(()=>{void refreshRef.current(true);}),hasMore:snapshot.leads.length<snapshot.total};
}
type Store=ReturnType<typeof useStore>;
const Ctx=createContext<Store|null>(null);
export function useSalesCrm(){const store=useContext(Ctx);if(!store)throw new Error('Sales provider is missing');return store;}
export function SalesCrmProvider({initial,attentionView=false,children}:{initial:SalesInitial;attentionView?:boolean;children:React.ReactNode}) {
 const value=useStore(initial,attentionView);return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
