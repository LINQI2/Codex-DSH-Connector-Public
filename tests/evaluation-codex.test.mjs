import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {CodexLogMetrics,codexUsage,codexSourceFor} from '../src/evaluation/codex-source.mjs';import {EvaluationStore} from '../src/evaluation/store.mjs';import {EvaluationCollector} from '../src/evaluation/collector.mjs';import {exportCsv} from '../src/evaluation/api.mjs';import {DatabaseSync} from 'node:sqlite';
const counter=n=>({input_tokens:n*10,cached_input_tokens:n*8,cache_write_input_tokens:0,output_tokens:n,total_tokens:n*11,reasoning_output_tokens:n});
const buckets=n=>({uncachedInputTokens:n*2,cacheReadTokens:n*8,cacheWriteTokens:0,outputTokens:n});
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-eval-'));t.after(()=>{if(fs.existsSync(dir)&&!fs.existsSync(path.join(dir,'evaluation','evaluation.sqlite')))fs.rmSync(dir,{recursive:true});});return dir;}
test('Codex缓存为输入子集，与DSH口径不同；重复token_count不累加推理',()=>{
 assert.deepEqual(codexUsage(counter(10)),buckets(10));assert.equal(codexUsage({...counter(1),cached_input_tokens:20}),null);assert.equal(codexUsage({...counter(1),total_tokens:999}),null);
});
test('原生JSONL增量读取只投影计量和回合；半行、重复、身份错配',t=>{
 const dir=setup(t),file=path.join(dir,'rollout.jsonl'),record=(type,payload)=>JSON.stringify({type,timestamp:'2026-11-06T02:00:00Z',payload})+'\n';
 fs.writeFileSync(file,record('session_meta',{id:'c',cwd:dir,base_instructions:'PRIVATE_PROMPT'})+record('event_msg',{type:'task_started',turn_id:'turn1',started_at:1793930400})+record('event_msg',{type:'token_count',info:{total_token_usage:counter(2)}})+record('event_msg',{type:'task_complete',turn_id:'turn1',completed_at:1793930410}));
 const reader=new CodexLogMetrics(file,{threadId:'c',cwd:dir});const first=reader.inspect();assert.deepEqual(first.usage,buckets(2));assert.equal(first.turns.length,1);assert.equal(first.running,false);assert.doesNotMatch(JSON.stringify(first),/PRIVATE_PROMPT|instructions|last_agent_message/);
 assert.deepEqual(reader.inspect().usage,first.usage);const text=record('event_msg',{type:'token_count',info:{total_token_usage:counter(3)}});fs.appendFileSync(file,text.slice(0,30));assert.deepEqual(reader.inspect().usage,first.usage);fs.appendFileSync(file,text.slice(30));assert.deepEqual(reader.inspect().usage,buckets(3));
 assert.throws(()=>new CodexLogMetrics(file,{threadId:'wrong',cwd:dir}).inspect(),/身份/);
});
test('双方独立用量/运行时间/估算；旧DSH数据保留且封存同时停止统计',async t=>{
 const dir=setup(t),store=new EvaluationStore(dir);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true});});const now=Date.now();let n=10,dc=10;
 const target={threadId:'c',hostId:'local',cwd:dir};const snapshot=()=>({...target,usage:buckets(n),generation:'one',cursor:n,observedAt:new Date().toISOString(),running:false,turns:[{id:'turn',start:now-10000,end:now+10000}]});
 const d={sessionId:'d',cwd:dir,running:false,projections:{asOfSeq:1,values:{tokenUsage:buckets(dc)}}};const c=new EvaluationCollector({store,runtime:dir,sourceFor:async()=>({inspect:async()=>d,follow:()=>()=>{}}),codexFor:async()=>snapshot()});
 const task=await c.register({title:'双方任务',sessionId:'d',workspace:dir,mode:'codex-dsh',codex:target});n=12;dc=15;d.projections.values.tokenUsage=buckets(dc);await c.tick();
 let result=store.detail(task.id);assert.equal(result.providers.codex.usage.totalTokens,22);assert.equal(result.providers.dsh.usage.totalTokens,55);assert.ok(result.providers.codex.executionMs!==null);assert.equal(result.providers.dsh.executionMs,null);
 store.setPrice(task.id,{currency:'CNY',label:'DSH价格',uncachedInputTokens:1,cacheReadTokens:1,cacheWriteTokens:0,outputTokens:1});store.setCodexPrice(task.id,{currency:'USD',label:'Codex价格',uncachedInputTokens:2,cacheReadTokens:2,cacheWriteTokens:0,outputTokens:2});result=store.detail(task.id);assert.equal(result.providers.dsh.estimate.currency,'CNY');assert.equal(result.providers.codex.estimate.currency,'USD');assert.equal(result.providers.codex.actualCost,null);
 await assert.rejects(()=>c.linkCodex(task.id,target),/活跃/);await c.finish(task.id);assert.equal(store.codexActive().length,0);assert.equal(store.active().length,0);assert.match(exportCsv(store.list()),/Codex已测Token/);await c.stop();
 const db=new EvaluationStore(dir);assert.equal(db.detail(task.id).providers.codex.usage.totalTokens,22);db.close();
});
test('Codex可独立登记，来源失败/计数回退标未知，不依赖DSH可用',async t=>{
 const dir=setup(t),store=new EvaluationStore(dir);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true});});const target={threadId:'c',hostId:'local',cwd:dir};let n=10,fail=false;
 const c=new EvaluationCollector({store,runtime:dir,sourceFor:async()=>{throw Error('DSH unavailable')},codexFor:async()=>{if(fail)throw Error('PRIVATE_AUTH');return {...target,usage:buckets(n),cursor:n,generation:'g',running:false,turns:[]};}});
 const task=await c.register({title:'仅Codex',mode:'codex-independent',codex:target});assert.equal(store.detail(task.id).providers.dsh.coverage,'unlinked');n=12;await c.tick();assert.equal(store.detail(task.id).providers.codex.usage.totalTokens,22);fail=true;await c.tick();assert.equal(store.detail(task.id).providers.codex.coverage,'partial');assert.doesNotMatch(JSON.stringify(store.detail(task.id)),/PRIVATE_AUTH/);fail=false;n=1;await c.tick();assert.equal(store.detail(task.id).providers.codex.usage,null);await c.finish(task.id);await c.stop();
});
test('只读索引精确定位原生文件，支持Windows长路径前缀，拒绝索引越界',async t=>{
 const dir=setup(t),sessions=path.join(dir,'sessions');fs.mkdirSync(sessions);const file=path.join(sessions,'native.jsonl'),outside=path.join(dir,'private.jsonl');
 fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'c',cwd:dir}})+'\n'+JSON.stringify({type:'event_msg',payload:{type:'token_count',info:{total_token_usage:counter(1)}}})+'\n');fs.writeFileSync(outside,'PRIVATE');
 const db=new DatabaseSync(path.join(dir,'state_5.sqlite'));db.exec('CREATE TABLE threads(id TEXT,rollout_path TEXT,cwd TEXT,archived INT)');db.prepare('INSERT INTO threads VALUES(?,?,?,0)').run('c',process.platform==='win32'?'\\\\?\\'+file:file,dir);
 const target={threadId:'c',hostId:'local',cwd:dir},read=codexSourceFor({home:dir,catalogProvider:()=>({threads:[{...target,readVerified:true}]})});assert.deepEqual((await read(target)).usage,buckets(1));
 db.prepare('UPDATE threads SET rollout_path=?').run(outside);await assert.rejects(()=>read(target),/不在原生sessions/);db.close();
});
test('旧DSH账本原样保留，仅新增Codex表，不迁移或清空历史',t=>{
 const dir=setup(t),store=new EvaluationStore(dir);const s={sessionId:'d',cwd:dir,running:false,projections:{asOfSeq:1,values:{tokenUsage:buckets(10)}}};store.create({id:'old-dsh',title:'已有任务',sessionId:'d',workspace:dir},s);store.db.exec('DROP TABLE codex_windows');store.close();
 const migrated=new EvaluationStore(dir);assert.equal(migrated.detail('old-dsh').title,'已有任务');assert.equal(migrated.detail('old-dsh').providers.dsh.totalWindows,1);assert.equal(migrated.detail('old-dsh').providers.codex.coverage,'unlinked');assert.equal(migrated.db.prepare('SELECT version FROM evaluation_meta').get().version,1);migrated.close();fs.rmSync(dir,{recursive:true});
});
test('运行中封存统计标未结算，不能把当前快照伪装成完整费用',async t=>{
 const dir=setup(t),store=new EvaluationStore(dir);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true});});let running=false;const target={threadId:'c',hostId:'local',cwd:dir};
 const c=new EvaluationCollector({store,runtime:dir,codexFor:async()=>({...target,usage:buckets(10),cursor:10,generation:'g',running,turns:[]})});const task=await c.register({title:'等待结算',mode:'codex-independent',codex:target});running=true;const d=await c.finish(task.id);assert.equal(d.providers.codex.coverage,'partial');assert.match(d.providers.codex.windows[0].issue,/尚未结算/);assert.equal(d.providers.codex.estimate,null);await c.stop();
});
