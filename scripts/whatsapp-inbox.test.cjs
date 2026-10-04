/* eslint-disable @typescript-eslint/no-require-imports -- Isolated execution of real TS server modules. */
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}) {
 const filename=path.join(root,file);const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const original=m.require.bind(m);
 m.require=name=>{if(name in mocks)return mocks[name];if(name.startsWith('@/')||name.startsWith('.')){const target=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(filename),name);const found=[target,target+'.ts',target+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(found)return load(path.relative(root,found),mocks);}return original(name);};
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);return m.exports;
}
const conversationId='00000000-0000-4000-8000-000000000001';const clientRef='00000000-0000-4000-8000-000000000002';
const base={conversationId,clientRef,body:'Hello'};
function actions({allow=true,configured=true,dispatch=true,outcome={metaId:'meta-1',errorCode:null},saveError=false}={}) {
 const calls=[];let graphCalls=0;
 const db={async rpc(name,args){calls.push({name,args});return {data:{dispatch,id:'message-id',attempt:'attempt-id',phone:'+919876543210',body:'Database body',name:'Owner',template:null,language:null},error:name==='platform_wa_finish_send'&&saveError?{message:'DB unavailable',code:'XX000'}:null};}};
 const modules=load('src/app/admin/whatsapp/inbox/actions.ts',{'server-only':{},'@/core/auth/access':{assertPermission:async()=>{if(!allow)throw new Error('Denied');}},'@/core/db/server-client':{createClient:async()=>db},'@/core/db/service-client':{createServiceClientForEnvironment:async env=>{assert.equal(env,'dev');return db;}},'@/core/db/loose-client':{loose:db=>db},'@/core/env/active-environment':{getActiveAdminEnvironment:async()=> 'dev'},'@/core/config/whatsapp':{managedWhatsAppConfig:()=>configured?{}:null},'@/core/whatsapp/managed-graph':{dispatchManagedMessage:async(env,m)=>{graphCalls++;assert.equal(env,'dev');assert.equal(m.body,'Database body');return outcome;}}});
 return {modules,calls,graphCalls:()=>graphCalls};
}
test('write permission runs before validation, database or Graph access',async()=>{const a=actions({allow:false});await assert.rejects(a.modules.sendInboxMessage(base),/Denied/);await assert.rejects(a.modules.inboxCommand(conversationId,'close'),/Denied/);assert.equal(a.calls.length,0);assert.equal(a.graphCalls(),0);});
test('invalid input and missing environment config cause no send reservation',async()=>{let a=actions();assert.ok((await a.modules.sendInboxMessage({...base,body:' '})).error);assert.ok((await a.modules.sendInboxMessage({...base,clientRef:'invalid'})).error);assert.equal(a.calls.length,0);a=actions({configured:false});assert.ok((await a.modules.sendInboxMessage(base)).error);assert.equal(a.calls.length,0);});
test('a durable reservation dispatches once using immutable database content and saves the Meta id',async()=>{const a=actions();assert.equal((await a.modules.sendInboxMessage(base)).error,null);assert.equal(a.graphCalls(),1);assert.deepEqual(a.calls.map(c=>c.name),['admin_wa_prepare_send','platform_wa_finish_send']);assert.equal(a.calls[1].args.p_meta_id,'meta-1');});
test('duplicate reservation never re-dispatches to Meta',async()=>{const a=actions({dispatch:false});assert.equal((await a.modules.sendInboxMessage(base)).id,'message-id');assert.equal(a.graphCalls(),0);assert.equal(a.calls.length,1);});
test('ambiguous network outcome or lost database acknowledgement waits for callbacks',async()=>{for(const options of [{outcome:{metaId:null,errorCode:'uncertain'}},{saveError:true}]){const a=actions(options);assert.match((await a.modules.sendInboxMessage(base)).error,/confirmation/);assert.equal(a.graphCalls(),1);}});
test('template mapping requires live approval plus allow-list and rejects unsupported variables/media',()=>{
 const graph=load('src/core/whatsapp/managed-graph.ts',{'server-only':{},'@/core/config/whatsapp':{}});
 const t={name:'platform_intro',language:'en',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}'}]};const allowed=[{name:t.name,language:t.language}];
 assert.equal(graph.mapApprovedTemplate(t,[]),null);assert.equal(graph.mapApprovedTemplate({...t,status:'REJECTED'},allowed),null);
 const mapped=graph.mapApprovedTemplate(t,allowed);assert.equal(graph.renderTemplate(mapped,'Priya Nair'),'Hello Priya');
 assert.equal(graph.mapApprovedTemplate({...t,components:[...t.components,{type:'HEADER',text:'Photo'}]},allowed),null);
 assert.equal(graph.mapApprovedTemplate({...t,components:[{type:'BODY',text:'{{1}} {{2}}'}]},allowed),null);
});
test('24-hour labels expire exactly at zero; IST date grouping is device-independent',()=>{
 const model=load('src/features/whatsapp-inbox/model.ts');assert.equal(model.windowRemaining('2026-10-04T10:00:00Z',Date.parse('2026-10-04T10:00:00Z')),null);
 assert.equal(model.windowRemaining('2026-10-04T10:01:00Z',Date.parse('2026-10-04T10:00:00Z')),'0h 1m');
 const data=load('src/features/whatsapp-inbox/data.ts');const rows=data.mapItems([{id:'one',kind:'in',created_at:'2026-10-03T18:29:00Z',body:'Before midnight'},{id:'two',kind:'in',created_at:'2026-10-03T18:31:00Z',body:'After midnight'}]);assert.equal(rows.filter(m=>m.kind==='day').length,2);assert.equal(rows.find(m=>m.id==='two').at,'00:01');
});
test('Graph request carries recovery callback and never retries ambiguous HTTP/network outcomes',async()=>{
 const graph=load('src/core/whatsapp/managed-graph.ts',{'server-only':{},'@/core/config/whatsapp':{managedWhatsAppConfig:()=>({phoneNumberId:'123',wabaId:'456',accessToken:'fixture-token',version:'v21.0'})}});
 const original=global.fetch;
 try{
  for(const [status,payload,expected] of [[200,{messages:[{id:'accepted'}]},null],[400,{error:{code:131047}},'131047'],[500,{error:{code:131000}},'uncertain']]){
   let calls=0;global.fetch=async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.biz_opaque_callback_data,'wa-inbox:'+conversationId);assert.equal(body.to,'919876543210');assert.equal(body.type,'text');return {ok:status===200,status,json:async()=>payload};};
   const result=await graph.dispatchManagedMessage('dev',{id:conversationId,phone:'+919876543210',body:'Hello'});assert.equal(result.errorCode,expected);assert.equal(calls,1);
  }
  let calls=0;global.fetch=async()=>{calls++;throw new Error('lost response');};assert.equal((await graph.dispatchManagedMessage('dev',{id:conversationId,phone:'+919876543210',body:'Hello'})).errorCode,'uncertain');assert.equal(calls,1);
 }finally{global.fetch=original;}
});
