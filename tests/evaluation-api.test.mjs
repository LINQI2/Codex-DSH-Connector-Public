import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {startConnections} from '../src/connections-server.mjs';import {root} from '../src/config.mjs';import {EvaluationStore} from '../src/evaluation/store.mjs';import {EvaluationCollector} from '../src/evaluation/collector.mjs';
test('评估API沿用本机来源保护、空数据、错误与安全导出，原连接不变',async t=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'connector-eval-api-')),store=new EvaluationStore(runtime);const usage={uncachedInputTokens:1,cacheReadTokens:2,cacheWriteTokens:3,outputTokens:4};
 const collector=new EvaluationCollector({store,runtime,sourceFor:async target=>({inspect:async()=>({sessionId:target.sessionId,cwd:runtime,running:false,projections:{asOfSeq:1,values:{tokenUsage:usage}}}),follow:()=>()=>{}})});
 const ui=await startConnections({runtime,html:path.join(root,'web','connections.html'),catalogProvider:()=>({threads:[]}),dshProvider:async()=>[],evaluation:{store,collector}});t.after(async()=>{await collector.stop();ui.server.closeAllConnections();await new Promise(r=>ui.server.close(r));store.close();fs.rmSync(runtime,{recursive:true});});
 const post=(body,origin=new URL(ui.url).origin)=>fetch(ui.url+'api/evaluation',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post({},'http://foreign.invalid')).status,403);assert.equal((await fetch(ui.url+'api/evaluation').then(r=>r.json())).tasks.length,0);
 const created=await post({action:'register',title:'测试任务',sessionId:'d',workspace:runtime,mode:'dsh-independent'}).then(r=>r.json());assert.ok(created.id);
 assert.equal((await fetch(ui.url+'api/evaluation/detail?id=unknown')).status,503);assert.equal((await post({action:'price',id:created.id,price:{}})).status,400);
 assert.equal((await fetch(ui.url+'evaluation')).status,200);const exported=await fetch(ui.url+'api/evaluation/export?format=json').then(r=>r.text());assert.doesNotMatch(exported,/evaluationBoundary|authUrl|cookie|PRIVATE_BODY/);
 assert.equal((await post({action:'finish',id:created.id})).status,200);assert.equal((await post({action:'resume',id:created.id})).status,400);assert.equal(fs.existsSync(path.join(runtime,'binding.json')),false);
});
