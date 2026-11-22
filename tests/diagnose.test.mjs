import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {diagnose,renderDiagnosis} from '../src/diagnose.mjs';
function fixture(t){const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'connector-diagnose-'));t.after(()=>fs.rmSync(runtime,{recursive:true}));const b={id:'binding',state:'enabled',mode:'autonomous',codex:{threadId:'codex',hostId:'local'},dsh:{sessionId:'dsh',workspace:runtime}};fs.writeFileSync(path.join(runtime,'binding.json'),JSON.stringify(b));let preset='probe-read-only',busy=false,calls=0;const options={runtime,configFor:()=>({hostReadyFile:'private'}),rpcFor:async()=>async(method)=>{assert.equal(method,'session/list');calls++;return {items:[{sessionId:'dsh',cwd:runtime,running:busy,projections:{values:{permissions:{currentValue:preset}}}}]};}};return {runtime,b,options,setPreset:p=>preset=p,setBusy:v=>busy=v,calls:()=>calls};}
test('只读核对输出身份/权限/空闲：不读取正文、不写运行记录、不把只读当写入可用',async t=>{
 const f=fixture(t),file=path.join(f.runtime,'binding.json'),before=fs.readFileSync(file);const r=await diagnose(f.options);assert.equal(r.dsh.permission,'只读');assert.equal(r.dsh.running,false);assert.equal(r.automaticRouting,false);assert.deepEqual(r.blockers,[]);assert.match(renderDiagnosis(r),/手动选择/);assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readdirSync(f.runtime),['binding.json']);
 f.setPreset('project-write');assert.equal((await diagnose(f.options)).dsh.permission,'项目读写');f.setPreset(undefined);assert.equal((await diagnose(f.options)).dsh.permission,'未确认');
});
test('调用者或目录不匹配不查询错误目标；忙状态与丢失身份明确阻止',async t=>{
 const f=fixture(t);assert.ok((await diagnose({...f.options,expectedThread:'other'})).blockers.includes('WRONG_CODEX_THREAD'));assert.ok((await diagnose({...f.options,expectedWorkspace:path.dirname(f.runtime)})).blockers.includes('WRONG_WORKSPACE'));assert.equal(f.calls(),0);
 f.setBusy(true);assert.ok((await diagnose(f.options)).blockers.includes('WORKSPACE_BUSY'));
 const r=await diagnose({...f.options,rpcFor:async()=>async()=>({items:[]})});assert.ok(r.blockers.includes('DSH_IDENTITY_MISMATCH'));assert.equal(r.dsh.checked,false);
});
test('完整访问准确显示，不要求用户切回项目内开发',async t=>{const f=fixture(t);for(const preset of ['danger-full-access','full-access']){f.setPreset(preset);const r=await diagnose(f.options);assert.equal(r.dsh.permission,'完整访问');assert.equal(r.next.some(n=>n.includes('手动选择')),false);}});
test('本地待答和unknown按绑定目标统计，不输出私有正文、凭据或原生错误',async t=>{
 const f=fixture(t),q={bindingId:f.b.id,sessionId:'dsh',codex:{threadId:'codex'},question:'PRIVATE_QUESTION',receipt:'token=SECRET'};
 fs.writeFileSync(path.join(f.runtime,'questions.json'),JSON.stringify([{...q,state:'pending'},{...q,state:'unknown'},{...q,bindingId:'other',state:'unknown'}]));
 fs.mkdirSync(path.join(f.runtime,'dispatches'));fs.writeFileSync(path.join(f.runtime,'dispatches','d.json'),JSON.stringify({sessionId:'dsh',state:'attempted',text:'PRIVATE_TASK'}));
 const r=await diagnose({...f.options,rpcFor:async()=>{throw Error('token=SECRET http://127.0.0.1/private');}});assert.equal(r.localRecords.pendingTechnicalQuestions,1);assert.equal(r.localRecords.unresolvedDeliveries,2);assert.ok(r.blockers.includes('UNRESOLVED_DELIVERY'));assert.ok(r.blockers.includes('DSH_CHECK_FAILED'));assert.doesNotMatch(JSON.stringify(r)+renderDiagnosis(r),/SECRET|PRIVATE_TASK|PRIVATE_QUESTION|127\.0\.0\.1/);
});
test('缺失或损坏状态保留现场，检查失败不修改或创建绑定',async t=>{
 const f=fixture(t),file=path.join(f.runtime,'binding.json');fs.unlinkSync(file);assert.ok((await diagnose(f.options)).blockers.includes('NO_BINDING'));assert.equal(fs.existsSync(file),false);fs.writeFileSync(file,'broken');assert.ok((await diagnose(f.options)).blockers.includes('BINDING_UNREADABLE'));assert.equal(fs.readFileSync(file,'utf8'),'broken');
});
