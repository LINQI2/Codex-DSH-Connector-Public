import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {priceValue,summarize,usageValue} from './metrics.mjs';
import {summarizeCodex} from './codex-metrics.mjs';
const iso=()=>new Date().toISOString();
const parse=row=>row?JSON.parse(row.body):null;
export class EvaluationStore{
 constructor(runtime){
  const dir=path.join(runtime,'evaluation');fs.mkdirSync(dir,{recursive:true});this.db=new DatabaseSync(path.join(dir,'evaluation.sqlite'));
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS evaluation_meta(version INTEGER NOT NULL);
   INSERT INTO evaluation_meta SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM evaluation_meta);
   CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS windows(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,session_id TEXT NOT NULL,active INTEGER NOT NULL,body TEXT NOT NULL);
   CREATE UNIQUE INDEX IF NOT EXISTS one_observer_per_session ON windows(session_id) WHERE active=1;
   CREATE TABLE IF NOT EXISTS events(window_id TEXT NOT NULL,seq INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(window_id,seq));
   CREATE TABLE IF NOT EXISTS codex_windows(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,thread_id TEXT NOT NULL,active INTEGER NOT NULL,body TEXT NOT NULL);
   CREATE UNIQUE INDEX IF NOT EXISTS one_codex_observer_per_thread ON codex_windows(thread_id) WHERE active=1;`);
  if(this.db.prepare('SELECT version FROM evaluation_meta').get().version!==1)throw Error('评估账本版本不兼容');
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const out=fn();this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 task(id){const row=parse(this.db.prepare('SELECT body FROM tasks WHERE id=?').get(id));if(!row)throw Error('没有此评估任务');return row;}
 tasks(){return this.db.prepare('SELECT body FROM tasks ORDER BY rowid DESC').all().map(parse);}
 putTask(t){this.db.prepare('INSERT INTO tasks VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(t.id,JSON.stringify(t));}
 window(id){const row=parse(this.db.prepare('SELECT body FROM windows WHERE id=?').get(id));if(!row)throw Error('没有此采集区间');return row;}
 putWindow(w){this.db.prepare('INSERT INTO windows VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,body=excluded.body').run(w.id,w.taskId,w.sessionId,w.active?1:0,JSON.stringify(w));}
 active(){return this.db.prepare('SELECT body FROM windows WHERE active=1').all().map(parse);}
 create({id=randomUUID(),title,sessionId,workspace,mode='dsh-independent',dispatchId=null,startedAt=null},session){
  if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id)||typeof title!=='string'||!title.trim()||title.length>160||typeof workspace!=='string'||!path.isAbsolute(workspace)||!['dsh-independent','codex-dsh'].includes(mode))throw Error('任务名称、目录或工作方式无效');
  if(session?.sessionId!==sessionId||path.resolve(session.cwd).toLowerCase()!==path.resolve(workspace).toLowerCase()||!Number.isSafeInteger(session.projections?.asOfSeq))throw Error('原生会话身份或采集边界无法确认');
  return this.transaction(()=>{
   if(this.db.prepare('SELECT id FROM tasks WHERE id=?').get(id))return this.task(id);
   const t={id,title:title.trim(),sessionId,workspace,mode,dispatchId,createdAt:startedAt&&Number.isFinite(Date.parse(startedAt))?new Date(startedAt).toISOString():iso(),closedAt:null,price:null,priceHistory:[],source:'DSH官方累计投影差值；仅选中会话登记后的区间，不含未关联子Agent或Codex'};
   this.putTask(t);this.startWindow(t,session);return t;
  });
 }
 startWindow(t,session){
  if(this.active().some(w=>w.sessionId===t.sessionId))throw Error('此会话已有正在采集的任务，请先结束该采集，避免重复归属');
  const usage=usageValue(session.projections?.values?.tokenUsage),at=iso();
  const w={id:randomUUID(),taskId:t.id,sessionId:t.sessionId,workspace:t.workspace,active:true,startSeq:session.projections.asOfSeq,cursor:session.projections.asOfSeq,baseline:usage,latest:usage,openedAt:at,observedAt:at,issue:!usage?'原生累计用量不可读取':session.running?'在执行中登记，可能包含登记前启动但之后结算的调用；仅作部分观察':null,disconnectedAt:null,state:session.running?'running':'waiting',closedAt:null};
  this.putWindow(w);return w;
 }
 resume(id,session){return this.transaction(()=>{const t=this.task(id);if(t.closedAt)throw Error('已结束的观察不能继续，请新建任务');if(session?.sessionId!==t.sessionId||path.resolve(session.cwd).toLowerCase()!==path.resolve(t.workspace).toLowerCase()||!Number.isSafeInteger(session.projections?.asOfSeq))throw Error('会话身份或边界不匹配');return this.startWindow(t,session);});}
 sample(id,session){return this.transaction(()=>{
  const w=this.window(id);if(!w.active)return w;
  if(session?.sessionId!==w.sessionId||path.resolve(session.cwd).toLowerCase()!==path.resolve(w.workspace).toLowerCase())throw Error('会话身份不符，不更新用量');
  const seq=session.projections?.asOfSeq;if(!Number.isSafeInteger(seq)||seq<w.startSeq)throw Error('原生序号回退，不更新用量');
  const u=usageValue(session.projections?.values?.tokenUsage);
  if(u&&((w.baseline&&Object.keys(u).some(k=>u[k]<w.baseline[k]))||(w.latest&&Object.keys(u).some(k=>u[k]<w.latest[k])))){w.issue='累计用量回退，差值不可确认';w.usageInvalid=true;}
  w.latest=u;w.observedAt=iso();w.state=session.running?'running':w.state==='turn-ended'?'turn-ended':'idle';
  if(!u)w.issue='原生用量缺失';
  this.putWindow(w);return w;
 });}
 events(id,rows,through){return this.transaction(()=>{
  const w=this.window(id);if(!w.active)return;
  for(const e of rows){
   if(!Number.isSafeInteger(e.seq)||e.seq<=w.cursor)continue;
   if(e.seq!==w.cursor+1)w.issue='事件有缺口；不推断缺失期间的执行时间';
   w.cursor=e.seq;
   // Persist no prompts, tool arguments, message bodies, reasoning or auth.
   if(['turn/start','turn/end','approval/asked'].includes(e.type)){
    const safe={windowId:id,seq:e.seq,type:e.type,time:typeof e.time==='number'&&Number.isFinite(e.time)?e.time:null};
    this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?)').run(id,e.seq,JSON.stringify(safe));
    if(e.type==='turn/end')w.state='turn-ended';
   }
  }
  if(Number.isSafeInteger(through)&&through>w.cursor){w.issue='历史窗口未覆盖全部事件';w.cursor=through;}
  this.putWindow(w);
 });}
 mark(id,message){const w=this.window(id);w.disconnectedAt=iso();w.issue=message;this.putWindow(w);}
 stopWindow(id){const w=this.window(id);w.active=false;w.closedAt=iso();this.putWindow(w);}
 closeTask(id){return this.transaction(()=>{const t=this.task(id);for(const w of this.active().filter(w=>w.taskId===id))this.stopWindow(w.id);t.closedAt=iso();this.putTask(t);return t;});}
 setPrice(id,value){const t=this.task(id);t.price=value?{...priceValue(value),configuredAt:iso()}:null;t.priceHistory??=[];t.priceHistory.push({at:iso(),value:t.price});this.putTask(t);return t;}
 codexActive(){return this.db.prepare('SELECT body FROM codex_windows WHERE active=1').all().map(parse);}
 putCodexWindow(w){this.db.prepare('INSERT INTO codex_windows VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,body=excluded.body').run(w.id,w.taskId,w.target.threadId,w.active?1:0,JSON.stringify(w));}
 linkCodex(id,target,snapshot){
  const t=this.task(id);if(t.closedAt)throw Error('已封存的任务不能增加新采集');
  if(this.codexActive().some(w=>w.target.threadId===target.threadId))throw Error('此Codex会话已归属活跃统计，请先结束原统计，避免重复计量');
  if(snapshot.threadId!==target.threadId||snapshot.hostId!==target.hostId||path.resolve(snapshot.cwd).toLowerCase()!==path.resolve(target.cwd).toLowerCase())throw Error('Codex原生身份不匹配');
  const at=iso(),w={id:randomUUID(),taskId:id,target:{threadId:target.threadId,hostId:target.hostId,cwd:target.cwd},active:true,baseline:usageValue(snapshot.usage),latest:usageValue(snapshot.usage),cursor:snapshot.cursor,generation:snapshot.generation,openedAt:at,observedAt:at,closedAt:null,running:snapshot.running,turns:[],source:snapshot.source,issue:snapshot.issue??(snapshot.running?'在Codex回合中途登记，可能含此前启动、之后结算的调用；时间仅含登记后区间':null)};
  this.putCodexWindow(w);return w;
 }
 sampleCodex(id,snapshot){
  const w=parse(this.db.prepare('SELECT body FROM codex_windows WHERE id=?').get(id));if(!w||!w.active)return;
  if(snapshot.threadId!==w.target.threadId||snapshot.hostId!==w.target.hostId||path.resolve(snapshot.cwd).toLowerCase()!==path.resolve(w.target.cwd).toLowerCase())throw Error('Codex采样身份不匹配');
  const u=usageValue(snapshot.usage);if(snapshot.generation!==w.generation||snapshot.cursor<w.cursor||(u&&w.latest&&Object.keys(u).some(k=>u[k]<w.latest[k]))){w.usageInvalid=true;w.issue='Codex记录或累计计数回退，区间用量不可确认';}
  if(snapshot.issue)w.issue=snapshot.issue;
  w.latest=u;w.cursor=snapshot.cursor;w.observedAt=iso();w.running=snapshot.running;
  w.turns=(snapshot.turns??[]).filter(t=>t.end===null||t.end>=Date.parse(w.openedAt)).map(t=>({id:t.id,start:t.start,end:t.end}));if(!u)w.issue='Codex原生用量字段缺失';this.putCodexWindow(w);
 }
 markCodex(id,message){const w=parse(this.db.prepare('SELECT body FROM codex_windows WHERE id=?').get(id));if(w){w.issue=message;this.putCodexWindow(w);}}
 stopCodex(id){for(const w of this.codexActive().filter(w=>w.taskId===id)){w.active=false;w.closedAt=iso();this.putCodexWindow(w);}}
 createCodexOnly({title},target,snapshot){const id=randomUUID();if(typeof title!=='string'||!title.trim()||title.length>160)throw Error('请填写160字以内任务名称');return this.transaction(()=>{const t={id,title:title.trim(),sessionId:null,workspace:target.cwd,mode:'codex-independent',dispatchId:null,createdAt:iso(),closedAt:null,price:null,priceHistory:[],source:'Codex本机选中会话指标；仅登记后区间'};this.putTask(t);this.linkCodex(id,target,snapshot);return t;});}
 setCodexPrice(id,value){const t=this.task(id);t.codexPrice=value?{...priceValue(value),configuredAt:iso()}:null;t.codexPriceHistory??=[];t.codexPriceHistory.push({at:iso(),value:t.codexPrice});this.putTask(t);return t;}
 detail(id){const t=this.task(id),windows=this.db.prepare('SELECT body FROM windows WHERE task_id=? ORDER BY rowid').all(id).map(parse);const events=windows.flatMap(w=>this.db.prepare('SELECT body FROM events WHERE window_id=? ORDER BY seq').all(w.id).map(parse));
  const summary=summarize(t,windows,events),codex=summarizeCodex(this.db.prepare('SELECT body FROM codex_windows WHERE task_id=? ORDER BY rowid').all(id).map(parse),t);
  const dsh={provider:'dsh',usage:summary.usage,estimate:summary.estimate,actualCost:null,active:summary.active,executionMs:summary.executionMs,timingComplete:summary.timingComplete,latestAt:summary.latestAt,observedState:summary.observedState,coverage:windows.length?summary.coverage:'unlinked',measuredWindows:summary.measuredWindows,totalWindows:summary.totalWindows};
  const latestAt=[summary.latestAt,codex.latestAt].filter(Boolean).sort().at(-1);
  return {...summary,codexUsage:codex.usage,providers:{codex,dsh},latestAt,active:summary.active||codex.active};
 }
 list(){return this.tasks().map(t=>{const {events,windows,...summary}=this.detail(t.id);const {windows:codexWindows,...codex}=summary.providers.codex;return {...summary,providers:{...summary.providers,codex}};});}
 close(){this.db.close();}
}
