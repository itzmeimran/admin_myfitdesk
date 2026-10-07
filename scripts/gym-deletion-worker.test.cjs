/* eslint-disable @typescript-eslint/no-require-imports -- Focused worker harness transpiles TS with mocked external APIs. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript');
const {test}=require('node:test');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const U='00000000-0000-0000-0000-000000000010';
function load() {
  const loaded={exports:{}};
  const code=ts.transpileModule(fs.readFileSync('src/core/gym-deletion/worker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module:loaded,exports:loaded.exports,process:{env:{GYM_DELETION_STORAGE_CONFIRMED_DEV:'true',GYM_DELETION_R2_BUCKETS_DEV:'[]'}},require:name=>name==='server-only'?{}:require(name)});
  return loaded.exports;
}
function fixture({failStorage=false,sharedUser=false,crossFolder=false,failDatabase=false}={}) {
  const calls=[],files=new Set([`${A}/members/a.webp`,`${A}/gym-logo.webp`,`${B}/members/b.webp`]);
  let cleared=false;
  const client={
    rpc:async(name,args)=>{calls.push({name,args});if(name==='claim_gym_deletion')return {data:{id:A,organization_id:A,user_ids:[U]},error:null};
      if(name==='purge_gym_database') {if(failDatabase)return {data:null,error:{message:'unsafe relationship'}}; cleared=true;}
      return {data:name==='gym_deletion_auth_candidate'?!sharedUser:null,error:null};},
    storage:{listBuckets:async()=>({data:[{id:'assets'}],error:null}),from:()=>({
      list:async(folder)=>{ if(failStorage)return {error:{message:'failure'}}; if(crossFolder)return {data:[{id:'foreign',name:`../${B}/members/b.webp`}],error:null};
        const entries=new Map();for(const key of files){if(!key.startsWith(`${folder}/`))continue;const suffix=key.slice(folder.length+1),parts=suffix.split('/');entries.set(parts[0],{name:parts[0],id:parts.length===1?'file':null});}
        return {data:[...entries.values()],error:null};},
      remove:async keys=>{calls.push({name:'remove',keys});keys.forEach(key=>files.delete(key));return {error:null};},
    })},
    auth:{admin:{deleteUser:async id=>{calls.push({name:'deleteUser',id});return {error:null};}}},
  };
  return {client,calls,files,get cleared(){return cleared;}};
}
test('Deletes only the target folder and completes after storage and auth',async()=>{
  const worker=load(),f=fixture();const result=await worker.runGymDeletionWorker(f.client,'dev');
  assert.equal(result.processed,1);assert.deepEqual([...f.files],[`${B}/members/b.webp`]);
  assert.ok(f.calls.findIndex(c=>c.name==='finish_gym_deletion')>f.calls.findIndex(c=>c.name==='deleteUser'));
});
test('Cross-folder paths cannot reach another gym; failure stays retryable',async()=>{
  const worker=load(),f=fixture({crossFolder:true});const result=await worker.runGymDeletionWorker(f.client,'dev');
  assert.equal(result.failed,1);assert.equal(f.calls.some(c=>c.name==='remove'),false);assert.ok(f.calls.at(-1).args.p_error);
});
test('Database failure does not touch files or login accounts',async()=>{
  const worker=load(),f=fixture({failDatabase:true});const result=await worker.runGymDeletionWorker(f.client,'dev');
  assert.equal(result.failed,1);assert.equal(f.cleared,false);assert.equal(f.calls.some(c=>c.name==='remove'||c.name==='deleteUser'),false);
});
test('Storage failure never marks the job complete',async()=>{
  const worker=load(),f=fixture({failStorage:true});await worker.runGymDeletionWorker(f.client,'dev');
  assert.equal(f.cleared,true);assert.ok(f.calls.at(-1).args.p_error);assert.equal(f.calls.some(c=>c.name==='deleteUser'),false);
});
test('An identity still used elsewhere is preserved',async()=>{
  const worker=load(),f=fixture({sharedUser:true});const result=await worker.runGymDeletionWorker(f.client,'dev');
  assert.equal(result.processed,1);assert.equal(f.calls.some(c=>c.name==='deleteUser'),false);
});
test('Rejects UUID prefixes, traversal and foreign organization IDs',()=>{
  const {assertGymObjectKey}=load();assert.doesNotThrow(()=>assertGymObjectKey(A,`${A}/members/a.webp`));
  for(const key of [`${B}/a.webp`,`${A}extra/a.webp`,`${A}/../a.webp`,`${A}\\a.webp`,`${A}//a.webp`])assert.throws(()=>assertGymObjectKey(A,key));
});
