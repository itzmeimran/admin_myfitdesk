/* eslint-disable @typescript-eslint/no-require-imports -- Test actual TS modules using the repository's existing CommonJS harness pattern. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
function load(file,mocks={}) {
  const filename=path.join(root,file);
  const m=new Module(filename,module);
  m.filename=filename; m.paths=Module._nodeModulePaths(path.dirname(filename));
  const original=m.require.bind(m);
  m.require=name=>{
    if(name in mocks) return mocks[name];
    if(name.startsWith('@/') || name.startsWith('.')) {
      const target=name.startsWith('@/') ? path.join(root,'src',name.slice(2)) : path.resolve(path.dirname(filename),name);
      const found=[target,`${target}.ts`,`${target}.tsx`].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
      if(found) return load(path.relative(root,found),mocks);
    }
    return original(name);
  };
  m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  return m.exports;
}
const validation=load('src/features/demo-requests/validation.ts');
const slots=load('src/features/demo-requests/slots.ts');
const values={gym:' FitZone ',name:' Owner ',phone:'+91 98765 43210',email:' OWNER@EXAMPLE.COM ',city:' Hyderabad ',state:'Telangana',branches:'1',members:'Under 100',message:''};
const win=slots.demoWindow();
let day=win.earliest;
while(slots.dayStatus(day,win)!=='open') day=slots.addDays(day,1);
const input={...values,date:day,time:0,website:'',requestId:'00000000-0000-4000-8000-000000000010'};

test('shared validation accepts +91 formats and rejects malformed data',()=>{
  assert.deepEqual(validation.validateDemoRequest(values,day,0),{});
  for(const phone of ['9876543210','+91 98765 43210','91 9876543210']) assert.equal(validation.validateDemoRequest({...values,phone},day,0).phone,undefined);
  for(const phone of ['98765','1234567890','abc9876543210']) assert.ok(validation.validateDemoRequest({...values,phone},day,0).phone);
  assert.ok(validation.validateDemoRequest({...values,state:'Fake',members:'Fake',branches:'99',message:'x'.repeat(1001)},'2026-02-30',18).date);
  const normalized=validation.normalizeDemoValues(values);
  assert.equal(normalized.phone,'9876543210'); assert.equal(normalized.email,'owner@example.com'); assert.equal(normalized.gym,'FitZone');
  const errors=validation.validateDemoRequest(validation.EMPTY_DEMO_FORM,null,null);
  assert.equal(Object.keys(errors).length,10);
});

test('bookable dates stay on IST boundaries and use real calendar status',()=>{
  const before=slots.demoWindow(new Date('2026-10-03T18:29:59Z'));
  const after=slots.demoWindow(new Date('2026-10-03T18:30:00Z'));
  assert.equal(before.today,'2026-10-03'); assert.equal(after.today,'2026-10-04');
  assert.equal(slots.dayStatus(after.today,after),'past');
  assert.equal(slots.dayStatus('2026-10-11',after),'closed');
  assert.equal(slots.dayStatus('2026-10-05',after,{'2026-10-05':'full'}),'full');
  assert.equal(slots.dayStatus('2026-10-09',after),'open'); // Old fake marked every ninth day full.
  assert.equal(slots.dayStatus(slots.addDays(after.last,1),after),'past');
});

function actionHarness(options={}) {
  const writes=[]; const rateKeys=[]; const notifications=[]; const afterCallbacks=[];
  const client={rpc:async(name,args)=>{
    writes.push({name,args});
    return {data:options.result??{returning:false,created:true},error:options.error??null};
  }};
  const server={createDemoClient:async()=>client,demoIpKey:()=> 'hashed-ip',demoContactKey:(s)=>s,demoContactEmail:()=> 'support@example.com',
    allowDemoRequest:async(_client,key)=>{rateKeys.push(key);return options.allowed!==false;},
    readDemoAvailability:async()=> options.availabilityFailure ? null : {date:day,status:'open',openSlots:[0]}};
  const action=load('src/app/book-demo/actions.ts',{
    './server':server,'next/headers':{headers:async()=>new Headers()},'next/server':{after:fn=>afterCallbacks.push(fn)},
    '@/core/config/email':{isEmailConfigured:()=>!!options.email},
    '@/core/email/system-email':{sendSystemEmail:async data=>{notifications.push(data);return {ok:false,error:'SMTP down'};}},
  });
  return {...action,writes,rateKeys,notifications,afterCallbacks};
}

test('server revalidates input and rejects honeypot/rate failures before writes',async()=>{
  const h=actionHarness();
  for(const bad of [null,{...input,state:'Invalid'},{...input,phone:'abc9876543210'},{...input,time:99},{...input,website:'spam'},{...input,date:win.today},{...input,message:'x'.repeat(1001)}]) {
    assert.equal((await h.submitDemoRequest(bad)).ok,false);
  }
  assert.equal(h.writes.length,0);
  const limited=actionHarness({allowed:false});
  assert.equal((await limited.submitDemoRequest(input)).ok,false); assert.equal(limited.writes.length,0);
  const unavailable=actionHarness({availabilityFailure:true});
  assert.equal((await unavailable.submitDemoRequest(input)).ok,false); assert.equal(unavailable.writes.length,0);
});

test('transaction gets only normalized details and returns the deliberate returning flag',async()=>{
  const h=actionHarness({result:{returning:true,created:true}});
  assert.deepEqual(await h.submitDemoRequest(input),{ok:true,returning:true});
  assert.equal(h.rateKeys.length,3);
  const payload=h.writes[0].args.p_payload;
  assert.equal(payload.phone,'+919876543210'); assert.equal(payload.email,'owner@example.com');
  assert.equal(payload.gym,'FitZone'); assert.equal('website' in payload,false); assert.equal('requestId' in payload,false);
  assert.equal(h.writes[0].args.p_id,input.requestId);
});

test('slot races are friendly and database failures never leak private details',async()=>{
  const race=actionHarness({error:{code:'P0002',message:'Time unavailable'}});
  assert.match((await race.submitDemoRequest(input)).error,/no longer available/);
  const outage=actionHarness({error:{code:'XX000',message:'private database details'}});
  assert.equal((await outage.submitDemoRequest(input)).error.includes('private'),false);
});

test('email failure does not undo acceptance; replay does not resend',async()=>{
  const h=actionHarness({email:true});
  assert.equal((await h.submitDemoRequest(input)).ok,true);
  assert.equal(h.afterCallbacks.length,1);
  await h.afterCallbacks[0](); assert.equal(h.notifications.length,1);
  assert.match(h.notifications[0].text,/isn't booked until we confirm/);
  const replay=actionHarness({email:true,result:{returning:false,created:false}});
  assert.equal((await replay.submitDemoRequest(input)).ok,true); assert.equal(replay.afterCallbacks.length,0);
});

test('public client ignores admin cookies and chooses only configured project credentials',async()=>{
  const original={...process.env}; const selected=[];
  const server=load('src/app/book-demo/server.ts',{
    'server-only':{},'@/core/db/service-client':{createServiceClientForEnvironment:async env=>{selected.push(env);return {}; }},
    '@/core/db/loose-client':{loose:c=>c},
    '@/core/config/server':{getServiceSupabaseCredentials:env=>({url:`https://${env==='dev'?'pgedlnxuuelmtpmbkdwm':'clbphruocsqsmklmrloq'}.supabase.co`})},
  });
  try {
    delete process.env.BOOK_DEMO_ENVIRONMENT; delete process.env.VERCEL_ENV;
    await server.createDemoClient();
    process.env.VERCEL_ENV='production'; await server.createDemoClient();
    process.env.BOOK_DEMO_ENVIRONMENT='dev'; await server.createDemoClient();
    process.env.BOOK_DEMO_ENVIRONMENT='anything'; await assert.rejects(server.createDemoClient());
    assert.deepEqual(selected,['dev','prod','dev']);
    process.env.VERCEL='1';
    assert.equal(server.demoIpKey(new Headers({'x-forwarded-for':'1.1.1.1'})),server.demoIpKey(new Headers()));
    assert.notEqual(server.demoIpKey(new Headers({'x-vercel-forwarded-for':'1.1.1.1'})),server.demoIpKey(new Headers()));
  } finally { process.env=original; }
});
