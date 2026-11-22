import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvaluationStore} from '../src/evaluation/store.mjs';
import {EvaluationCollector} from '../src/evaluation/collector.mjs';
import {usageValue,usageDelta,unionMs} from '../src/evaluation/metrics.mjs';
import {exportCsv} from '../src/evaluation/api.mjs';
const usage=n=>({uncachedInputTokens:n,cacheReadTokens:n*2,cacheWriteTokens:n*3,outputTokens:n*4});
function setup(t){
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'connector-eval-')),store=new EvaluationStore(runtime);
 const s={sessionId:'d',cwd:runtime,running:false,projections:{asOfSeq:10,values:{tokenUsage:usage(10)}}};
 const input={id:'task-a',title:'测试功能',sessionId:'d',workspace:runtime};
 t.after(()=>{store.close();fs.rmSync(runtime,{recursive:true});});return {runtime,store,s,input};
}
test('官方四项用量互斥，推理不重复计数；缺失和累计回退均未知',()=>{
 assert.deepEqual(usageDelta(usage(10),{...usage(12),reasoningTokens:100}),usage(2));assert.equal(usageValue({inputTokens:1,outputTokens:2}),null);
 assert.equal(usageDelta(usage(10),usage(1)),null);assert.equal(usageValue({...usage(1),outputTokens:-1}),null);
 assert.equal(unionMs([[0,10],[5,20],[30,40],[40,41]]),31);
});
test('采集基线、断点与恢复持久化；同会话不重复归属',t=>{
 const f=setup(t);f.store.create(f.input,f.s);assert.throws(()=>f.store.create({...f.input,id:'task-b'},f.s),/已有正在采集/);
 const w=f.store.active()[0];f.s.projections.values.tokenUsage=usage(13);f.store.sample(w.id,f.s);
 assert.equal(f.store.detail('task-a').usage.totalTokens,30);const db=new EvaluationStore(f.runtime);assert.equal(db.detail('task-a').usage.totalTokens,30);db.close();
 f.store.stopWindow(w.id);f.s.projections.values.tokenUsage=usage(20);f.store.resume('task-a',f.s);const next=f.store.active()[0];f.s.projections.values.tokenUsage=usage(21);f.store.sample(next.id,f.s);
 assert.equal(f.store.detail('task-a').usage.totalTokens,40); // excludes unobserved 13..20
});
test('事件去重、缺口标注、白名单存储，结束不是验收通过',t=>{
 const f=setup(t);f.store.create(f.input,f.s);const w=f.store.active()[0];const rows=[{seq:11,type:'turn/start',time:1000,data:{secret:'DO_NOT_PERSIST'}},{seq:12,type:'assistant/message',data:{message:{content:'PRIVATE_BODY'}}},{seq:13,type:'turn/end',time:4000}];
 f.store.events(w.id,rows,13);f.store.events(w.id,rows,13);f.store.stopWindow(w.id);const result=f.store.detail('task-a');assert.equal(result.events.length,2);assert.equal(result.executionMs,3000);assert.equal(result.timingComplete,true);assert.equal(result.closedAt,null);assert.doesNotMatch(JSON.stringify(result),/DO_NOT_PERSIST|PRIVATE_BODY|approved/);
 f.store.resume('task-a',f.s);const next=f.store.active()[0];f.store.events(next.id,[{seq:15,type:'turn/end',time:5000}],15);assert.equal(f.store.detail('task-a').coverage,'partial');
});
test('未知用量不是零费用，估算与原始账单分离；暂停后不继续累计',t=>{
 const f=setup(t);f.s.projections.values.tokenUsage=null;f.store.create(f.input,f.s);assert.equal(f.store.detail('task-a').usage,null);assert.equal(f.store.detail('task-a').actualCost,null);
 assert.throws(()=>f.store.setPrice('task-a',{currency:'CNY',label:'x'}),/四项/);f.store.setPrice('task-a',{currency:'CNY',label:'测试计价',...usage(1)});assert.equal(f.store.detail('task-a').estimate,null);
 f.store.closeTask('task-a');assert.throws(()=>f.store.resume('task-a',f.s),/已结束/);
});
test('估算价格版本、缓存拆分、累计重置不误算与CSV公式转义',t=>{
 const f=setup(t);f.store.create(f.input,f.s);const w=f.store.active()[0];f.s.projections.values.tokenUsage=usage(11);f.store.sample(w.id,f.s);
 f.store.setPrice('task-a',{currency:'USD',label:'用户输入的价格',uncachedInputTokens:1,cacheReadTokens:1,cacheWriteTokens:1,outputTokens:1});const d=f.store.detail('task-a');assert.equal(d.estimate.amount,0.00001);assert.ok(d.price.configuredAt);
 f.s.projections.values.tokenUsage=usage(2);f.store.sample(w.id,f.s);assert.equal(f.store.detail('task-a').estimate,null);assert.equal(f.store.detail('task-a').usage,null);
 assert.match(exportCsv([{...d,title:'=HYPERLINK("bad")'}]),/'=HYPERLINK/);
});
test('collector只观察官方来源，结束冻结；不调用模型或保存正文',async t=>{
 const f=setup(t);let cb,closed=0,calls=0;const collector=new EvaluationCollector({store:f.store,runtime:f.runtime,sourceFor:async()=>({inspect:async()=>{calls++;return f.s;},follow:x=>{cb=x;return ()=>closed++;}})});
 await collector.register(f.input);cb.onFrame({type:'snapshot',header:{id:'d',cwd:f.runtime},cursor:10,records:[]});await new Promise(r=>setTimeout(r,0));
 cb.onFrame({type:'event',event:{seq:11,type:'turn/start',time:1000}});f.s.projections.asOfSeq=12;f.s.projections.values.tokenUsage=usage(12);cb.onFrame({type:'event',event:{seq:12,type:'turn/end',time:3000}});await new Promise(r=>setTimeout(r,10));
 const d=f.store.detail('task-a');assert.equal(d.active,false);assert.equal(d.executionMs,2000);assert.equal(d.usage.totalTokens,20);assert.equal(d.closedAt,null);assert.equal(closed,1);assert.ok(calls<=4);await collector.stop();
});
test('断线/身份不符保留缺口，不发送、不停止原任务；重启不双计',async t=>{
 const f=setup(t);let cb;const source={inspect:async()=>f.s,follow:x=>{cb=x;return ()=>{};}};const c=new EvaluationCollector({store:f.store,runtime:f.runtime,sourceFor:async()=>source});await c.register(f.input);cb.onClose();assert.equal(f.store.detail('task-a').coverage,'partial');await c.tick();assert.equal(f.store.active().length,1);await c.stop();
 const bad=new EvaluationCollector({store:f.store,runtime:f.runtime,sourceFor:async()=>({...source,inspect:async()=>({...f.s,cwd:'D:\\wrong'})})});await bad.tick();assert.match(f.store.active()[0].issue,/身份/);await bad.stop();
});
test('新的委派有采集边界才导入；旧历史不自动批量补算',async t=>{
 const f=setup(t),dir=path.join(f.runtime,'dispatches');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'old.json'),JSON.stringify({id:'old',text:'旧历史'}));fs.writeFileSync(path.join(dir,'new.json'),JSON.stringify({id:'new',text:'新委派',state:'accepted',sessionId:'d',workspace:f.runtime,evaluationBoundary:{seq:10,usage:usage(10)}}));
 const c=new EvaluationCollector({store:f.store,runtime:f.runtime,sourceFor:async()=>({inspect:async()=>f.s,follow:()=>()=>{}})});await c.tick();assert.deepEqual(f.store.tasks().map(t=>t.id),['new']);await c.tick();assert.equal(f.store.tasks().length,1);await c.stop();
});
test('运行中登记标部分观察；计数回退后不恢复为虚假精确金额',t=>{
 const f=setup(t);f.s.running=true;f.store.create(f.input,f.s);const w=f.store.active()[0];assert.equal(f.store.detail('task-a').coverage,'partial');assert.match(w.issue,/登记前/);
 f.s.projections.values.tokenUsage=usage(20);f.store.sample(w.id,f.s);f.s.projections.values.tokenUsage=usage(15);f.store.sample(w.id,f.s);assert.equal(f.store.detail('task-a').usage,null);
 f.s.projections.values.tokenUsage=usage(25);f.store.sample(w.id,f.s);assert.equal(f.store.detail('task-a').usage,null);
});
test('导入损坏记录不阻断独立观察；关闭后数据库可重新读取且不产生假完成',async t=>{
 const f=setup(t),dir=path.join(f.runtime,'dispatches');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'broken.json'),'{');let cb;
 const c=new EvaluationCollector({store:f.store,runtime:f.runtime,sourceFor:async()=>({inspect:async()=>f.s,follow:x=>{cb=x;return ()=>{};}})});await c.register(f.input);assert.ok(cb);assert.match(c.lastError,/部分委派/);await c.stop();
 const d=f.store.detail('task-a');assert.equal(d.closedAt,null);assert.equal(d.coverage,'partial');const reopened=new EvaluationStore(f.runtime);assert.equal(reopened.task('task-a').closedAt,null);reopened.close();
});
