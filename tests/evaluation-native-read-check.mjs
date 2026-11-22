// Explicit real-provider READ ONLY check. No prompt, permissions, task or Session creation.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {root,loadConfig} from '../src/config.mjs';import {Workspaces} from '../src/workspaces.mjs';import {nativeSourceFor} from '../src/evaluation/native-source.mjs';import {EvaluationStore} from '../src/evaluation/store.mjs';import {EvaluationCollector} from '../src/evaluation/collector.mjs';import {usageValue,usageDelta} from '../src/evaluation/metrics.mjs';
const file=path.join(root,'.runtime','binding.json'),hash=()=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),beforeHash=hash(),binding=JSON.parse(fs.readFileSync(file,'utf8'));
const runtime=fs.mkdtempSync(path.join(root,'.runtime','eval-native-read-')),store=new EvaluationStore(runtime),sourceFor=nativeSourceFor(new Workspaces(loadConfig()));let collector;
try{
 const target={sessionId:binding.dsh.sessionId,workspace:binding.dsh.workspace};const source=await sourceFor(target);const before=await source.inspect();assert.ok(usageValue(before.projections.values.tokenUsage),'真实累计用量字段不完整，不能宣告接入通过');
 collector=new EvaluationCollector({store,runtime,sourceFor});const task=await collector.register({...target,title:'评估只读采样核验（不派发任务）'});
 await new Promise(r=>setTimeout(r,1500));const w=store.active()[0];assert.ok(w);assert.equal(collector.streams.get(w.id)?.opened,true,'未收到原生事件流身份快照');
 await collector.finish(task.id);const detail=store.detail(task.id),after=await source.inspect();assert.equal(detail.active,false);assert.equal(hash(),beforeHash);
 const expected=usageDelta(detail.windows[0].baseline,detail.windows[0].latest);assert.ok(expected);for(const key of Object.keys(expected))assert.equal(detail.usage[key],expected[key]);
 const result={provider:'real official DSH Host',modelCalls:0,nativeUsageShapeConfirmed:true,streamOpened:true,taskWindowDeltaMatched:true,observedTokens:detail.usage.totalTokens,originalBindingUnchanged:true,sessionIdUnchanged:before.sessionId===after.sessionId,originalRunning:before.running,latestRunning:after.running,coverage:detail.coverage,notVerified:['真实新任务Token增长与原生回合结束','Codex用量','实际账单','跨进程长时间断线补采']};
 const evidence=path.join(root,'.runtime','evaluation-evidence');fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'native-read-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await collector?.stop();store.close();fs.rmSync(runtime,{recursive:true});}
