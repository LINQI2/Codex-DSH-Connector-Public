import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {waitForFeedback} from '../src/feedback-wait.mjs';
function setup(t){
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'connector-wait-'));t.after(()=>fs.rmSync(runtime,{recursive:true}));
 const b={id:'b',revision:1,state:'enabled',mode:'autonomous',codex:{threadId:'c',hostId:'local'},dsh:{sessionId:'d',workspace:runtime}};
 const save=()=>fs.writeFileSync(path.join(runtime,'binding.json'),JSON.stringify(b));save();
 let callbacks,closed=0,calls=0,running=true;
 const rpc=async method=>{assert.equal(method,'session/list');calls++;return {items:[{sessionId:'d',cwd:runtime,running,projections:{asOfSeq:10}}]};};
 rpc.followSession=c=>{callbacks=c;return ()=>closed++;};
 const options={runtime,expectedThread:'c',expectedWorkspace:runtime,rpcFor:async()=>rpc,waitMs:500,localCheckMs:5};
 const start=async extra=>{const promise=waitForFeedback({...options,...extra});await new Promise(r=>setTimeout(r,0));return {promise};};
 const snapshot=(extra={})=>callbacks.onFrame({type:'snapshot',header:{id:'d',cwd:runtime},cursor:10,records:[],...extra});
 const event=(seq,type,data={})=>callbacks.onFrame({type:'event',event:{seq,type,data}});
 return {runtime,b,save,options,start,snapshot,event,callbacks:()=>callbacks,calls:()=>calls,closed:()=>closed,setRunning:v=>running=v};
}
test('等待期间仅两次只读查询；普通工具失败/文本不返回，原生回合结束才反馈',async t=>{
 const f=setup(t),{promise}=await f.start();f.snapshot();f.event(11,'tool/result',{isError:true});f.event(12,'assistant/message',{message:{content:[{type:'text',text:'PRIVATE_BODY'}]}});
 await new Promise(r=>setTimeout(r,20));assert.equal(f.closed(),0);assert.equal(f.calls(),2);
 f.event(13,'turn/end',{reason:{kind:'completed'}});const r=await promise;
 assert.equal(r.kind,'turn-ended');assert.equal(r.cursor,13);assert.equal(r.modelCalls,0);assert.equal(f.closed(),1);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY/);assert.match(r.message,/不等于/);
});
test('已存在及新写入技术问题仅返回当前绑定问题ID，不传凭据或历史正文',async t=>{
 const f=setup(t),{promise}=await f.start();f.snapshot();
 const q={id:'q-a',bindingId:'b',sessionId:'d',codex:{threadId:'c'},state:'pending',question:'PRIVATE_SECRET'};
 fs.writeFileSync(path.join(f.runtime,'questions.json'),JSON.stringify([{...q,bindingId:'other',id:'q-old'},q]));
 const r=await promise;assert.equal(r.kind,'technical-question');assert.deepEqual(r.questionIds,['q-a']);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SECRET|q-old/);
 assert.equal((await waitForFeedback(f.options)).kind,'technical-question');assert.equal(f.calls(),2);
});
test('暂停/改绑即停止；取消只关闭监听，不执行停止或发送',async t=>{
 const f=setup(t),{promise}=await f.start();f.snapshot();f.b.state='paused';f.b.revision++;f.save();assert.equal((await promise).kind,'binding-changed');assert.equal(f.closed(),1);
 f.b.state='enabled';f.save();const controller=new AbortController();const next=await f.start({signal:controller.signal});f.snapshot();controller.abort();assert.equal((await next.promise).kind,'cancelled');
});
test('超时不算失败、不轮询远程；断线不重连；审批不自动批准',async t=>{
 const f=setup(t);let next=await f.start({waitMs:30});f.snapshot();assert.equal((await next.promise).kind,'timeout');assert.equal(f.calls(),2);
 next=await f.start();f.snapshot();f.callbacks().onClose();assert.equal((await next.promise).kind,'disconnected');assert.equal(f.closed(),2);
 next=await f.start();f.snapshot();f.event(11,'approval/asked',{token:'SECRET'});const r=await next.promise;assert.equal(r.kind,'approval-required');assert.doesNotMatch(JSON.stringify(r),/SECRET/);
});
test('启动空闲明确返回idle，不把历史结束当新完成；开流竞态的新结束能回收',async t=>{
 const f=setup(t);f.setRunning(false);let next=await f.start();f.snapshot({records:[{type:'event',event:{seq:10,type:'turn/end'}}]});assert.equal((await next.promise).kind,'idle');
 f.setRunning(true);next=await f.start();f.snapshot({cursor:11,records:[{type:'event',event:{seq:11,type:'turn/end',data:{reason:{kind:'failed'}}}}]});assert.equal((await next.promise).reasonKind,'failed');
});
test('身份不符、跳号、截断窗口或状态损坏均保守停止，不改变现场',async t=>{
 const f=setup(t);await assert.rejects(waitForFeedback({...f.options,expectedThread:'wrong'}));assert.equal(f.calls(),0);
 let next=await f.start();f.snapshot({header:{id:'other',cwd:f.runtime}});assert.equal((await next.promise).kind,'identity-mismatch');
 next=await f.start();f.snapshot();f.event(12,'turn/end');assert.equal((await next.promise).kind,'history-gap');
 next=await f.start({afterSeq:2});f.snapshot();assert.equal((await next.promise).kind,'history-gap');
 next=await f.start();f.snapshot();fs.writeFileSync(path.join(f.runtime,'questions.json'),'broken');assert.equal((await next.promise).kind,'local-state-error');assert.equal(fs.readFileSync(path.join(f.runtime,'questions.json'),'utf8'),'broken');
});
