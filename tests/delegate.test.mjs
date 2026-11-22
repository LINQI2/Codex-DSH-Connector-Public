import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {BindingStore} from '../src/bindings.mjs';import {delegate} from '../src/delegate.mjs';
function setup(t,submit=async()=>({accepted:true})){
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'connector-planner-'));t.after(()=>fs.rmSync(runtime,{recursive:true}));const workspace=path.join(runtime,'project');fs.mkdirSync(workspace);const taskFile=path.join(workspace,'work.md');fs.writeFileSync(taskFile,'已授权工作包');const b=new BindingStore(runtime);const input={name:'连接',mode:'autonomous',codex:{threadId:'c',hostId:'local'},dsh:{sessionId:'d',workspace}};b.save(input,0);b.verify({codexIdentity:true,dshIdentity:true},1);b.transition('enable',2);let calls=0,busy=false,preset='project-write';const options={runtime,expectedThread:'c',expectedWorkspace:workspace,taskFile,id:'planner-test-000001',clientFor:async()=>({inspect:async()=>({running:busy,projections:{values:{permissions:{currentValue:preset}}}}),hasRunningWorkspace:async()=>busy,submit:async(...a)=>{calls++;return submit(...a);}})};
 return {runtime,workspace,taskFile,b,input,options,calls:()=>calls,busy:v=>busy=v,preset:v=>preset=v};
}
test('用户已选完整访问可委派，不替用户改权限；未知与只读仍拒绝',async t=>{
 for(const preset of ['danger-full-access','full-access']){const x=setup(t);x.preset(preset);assert.equal((await delegate({...x.options,send:true})).state,'accepted');assert.equal(x.calls(),1);}
 for(const preset of ['probe-read-only','read-only','unknown',undefined]){const x=setup(t);x.preset(preset);await assert.rejects(delegate({...x.options,send:true}),/读写权限/);assert.equal(x.calls(),0);}
});
test('预览零调用无投递记录；实际只发送一次且来源为规划CLI非伪造人工批准',async t=>{
 const x=setup(t),before=fs.readFileSync(x.taskFile);assert.equal((await delegate(x.options)).mode,'preview');assert.equal(x.calls(),0);assert.equal(fs.existsSync(path.join(x.runtime,'dispatches')),false);
 const result=await delegate({...x.options,send:true});assert.equal(result.state,'accepted');const row=JSON.parse(fs.readFileSync(path.join(x.runtime,'dispatches',x.options.id+'.json')));assert.equal(row.submittedVia,'planner-cli');assert.equal(row.receipt.accepted,true);assert.deepEqual(fs.readFileSync(x.taskFile),before);await assert.rejects(delegate({...x.options,send:true}),/已有记录/);assert.equal(x.calls(),1);
});
test('身份/目录错配、工程外文档、暂停和confirm-new均不发模型',async t=>{
 const x=setup(t);await assert.rejects(delegate({...x.options,expectedThread:'wrong',send:true}),/不符/);await assert.rejects(delegate({...x.options,expectedWorkspace:x.runtime,send:true}),/不符/);const outside=path.join(x.runtime,'outside.md');fs.writeFileSync(outside,'outside');await assert.rejects(delegate({...x.options,taskFile:outside,send:true}),/工程内/);x.b.transition('pause',3);await assert.rejects(delegate({...x.options,send:true}),/自主/);x.b.save({...x.input,mode:'confirm-new'},4);x.b.verify({codexIdentity:true,dshIdentity:true},5);x.b.transition('enable',6);await assert.rejects(delegate({...x.options,send:true}),/自主/);assert.equal(x.calls(),0);
});
test('只读或忙不发送；超时保留unknown且不允许换编号绕过',async t=>{
 const x=setup(t,async()=>{throw Error('timeout token=PRIVATE');});x.preset('probe-read-only');await assert.rejects(delegate({...x.options,send:true}),/读写权限/);x.preset('project-write');x.busy(true);await assert.rejects(delegate({...x.options,send:true}),/等待中/);x.busy(false);await assert.rejects(delegate({...x.options,send:true}),/待核对/);await assert.rejects(delegate({...x.options,id:'planner-test-000002',send:true}),/待核对/);assert.equal(x.calls(),1);assert.equal(fs.existsSync(path.join(x.runtime,'dispatch.lock')),false);
});
test('同一runtime并发仅一次提交，技术答复unknown也阻止新任务',async t=>{
 let release,entered;const inSubmit=new Promise(r=>entered=r),x=setup(t,()=>new Promise(r=>{release=()=>r({accepted:true});entered();}));const first=delegate({...x.options,send:true});await inSubmit;await assert.rejects(delegate({...x.options,id:'planner-test-000002',send:true}),/投递锁/);release();await first;assert.equal(x.calls(),1);
 fs.writeFileSync(path.join(x.runtime,'questions.json'),JSON.stringify([{bindingId:x.b.read().id,sessionId:'d',state:'unknown'}]));await assert.rejects(delegate({...x.options,id:'planner-test-000003',send:true}),/待核对/);assert.equal(x.calls(),1);
});
