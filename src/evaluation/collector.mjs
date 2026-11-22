import fs from 'node:fs';
import path from 'node:path';
// Read-only observer. Never calls prompt, permissions, stop, create or answer.
export class EvaluationCollector{
 constructor({store,runtime,sourceFor,codexFor,intervalMs=30000}){Object.assign(this,{store,runtime,sourceFor,codexFor,intervalMs});this.streams=new Map();this.stopped=false;this.busy=false;this.lastError=null;}
 start(){for(const w of this.store.active())this.store.mark(w.id,'检测到跨重启采集；历史补采范围需核对');this.timer=setInterval(()=>this.tick(),this.intervalMs);this.timer.unref();void this.tick();}
 async importDispatches(){
  const dir=path.join(this.runtime,'dispatches');if(!fs.existsSync(dir))return 0;let errors=0;
  const known=new Set(this.store.tasks().map(t=>t.id));
  for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json'))){try{const row=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
   if(!row.evaluationBoundary)continue;
   if(known.has(row.id)){const t=this.store.task(row.id);if(row.codexTarget&&!t.codexAttachAttempted&&!t.closedAt)await this.autoLinkCodex(t,row.codexTarget);continue;}
   const b=row.evaluationBoundary;
   this.store.create({id:row.id,title:row.text.split('\n')[0].slice(0,160)||'已委派任务',sessionId:row.sessionId,workspace:row.workspace,mode:row.submittedVia==='planner-cli'?'codex-dsh':'dsh-independent',dispatchId:row.id,startedAt:row.at},{sessionId:row.sessionId,cwd:row.workspace,running:false,projections:{asOfSeq:b.seq,values:{tokenUsage:b.usage}}});
   if(row.state!=='accepted'){const w=this.store.active().find(w=>w.taskId===row.id);if(w)this.store.mark(w.id,'投递结果未确认；统计不证明已执行，也不触发重发');}
   if(row.codexTarget)await this.autoLinkCodex(this.store.task(row.id),row.codexTarget);
  }catch{errors++;}}return errors;
 }
 async tick(){
  if(this.stopped||this.busy)return;this.busy=true;let done;this.tickDone=new Promise(resolve=>done=resolve);
  try{const errors=await this.importDispatches();for(const w of this.store.active()){
   if(this.stopped)break;
   if(!this.streams.has(w.id))await this.attach(w);
   else await this.sample(w);
  }for(const w of this.store.codexActive())await this.sampleCodex(w);
  this.lastError=errors?'部分委派未能归属评估任务，请核对采集区间；原派发不受影响':null;}catch{this.lastError='评估采集未完成；原任务不受影响，请核对数据覆盖';}finally{this.busy=false;done();}
 }
 async sample(w){
  try{const source=this.streams.get(w.id)?.source??await this.sourceFor(w);const s=await source.inspect();this.store.sample(w.id,s);return s;}
  catch{this.store.mark(w.id,'只读用量查询失败；保留原记录，不代表执行失败');return null;}
 }
 async attach(w){
  try{
   const source=await this.sourceFor(w);if(this.stopped)return;
   const s=await source.inspect();this.store.sample(w.id,s);
   const entry={source,close:null,opened:false,queue:Promise.resolve()};this.streams.set(w.id,entry);
   const close=()=>{clearTimeout(entry.timer);entry.close?.();this.streams.delete(w.id);};
   const frame=async f=>{
    if(this.stopped||!this.store.window(w.id).active)return;
    if(f.type==='snapshot'){
     if(f.header?.id!==w.sessionId||path.resolve(f.header?.cwd??'').toLowerCase()!==path.resolve(w.workspace).toLowerCase())throw Error('身份不匹配');
     entry.opened=true;
     clearTimeout(entry.timer);
     const rows=(f.records??[]).filter(r=>r.type==='event').map(r=>r.event);
     this.store.events(w.id,rows,f.cursor);
     // History after restart is bounded. Never treat a truncated window as complete.
     const end=rows.find(e=>e.seq>w.cursor&&e.type==='turn/end');if(end){const s=await this.sample(w);if(s?.running||s?.projections?.asOfSeq>end.seq)this.store.mark(w.id,'结束后采样已出现后续原生记录，用量归属需核对');this.store.stopWindow(w.id);close();}
    }else if(f.type==='event'&&f.event){
     const before=this.store.window(w.id).cursor;this.store.events(w.id,[f.event]);
     if(f.event.seq>before&&f.event.type==='turn/end'){const s=await this.sample(w);if(s?.running||s?.projections?.asOfSeq>f.event.seq)this.store.mark(w.id,'结束后采样已出现后续原生记录，用量归属需核对');this.store.stopWindow(w.id);close();}
    }else throw Error('事件协议不兼容');
   };
   entry.close=source.follow({onFrame:f=>{entry.queue=entry.queue.then(()=>frame(f)).catch(()=>{if(this.stopped)return;this.store.mark(w.id,'事件连接或协议异常；覆盖不完整');close();});},onClose:()=>{if(this.stopped)return;this.store.mark(w.id,'原生事件连接中断；恢复后核对，未停止任务');close();}});
   entry.timer=setTimeout(()=>{if(this.stopped||entry.opened)return;this.store.mark(w.id,'未及时收到原生身份快照；数据覆盖待核对');close();},10000);entry.timer.unref();
  }catch{this.streams.delete(w.id);this.store.mark(w.id,'原生来源暂不可用或身份不符；未连接其他工程');}
 }
 async sampleCodex(w){
  try{if(!this.codexFor)throw Error('Codex来源未配置');const snapshot=await this.codexFor(w.target);this.store.sampleCodex(w.id,snapshot);return snapshot;}
  catch{this.store.markCodex(w.id,'Codex本机指标暂不可读取；保留原记录，不推断为零用量或执行失败');return null;}
 }
 async linkCodex(id,target){if(!this.codexFor)throw Error('Codex只读来源未配置');return this.store.linkCodex(id,target,await this.codexFor(target));}
 async autoLinkCodex(t,target){let warning;try{await this.linkCodex(t.id,target);warning='从委派登记时建立Codex基线；此前规划用量未回填';}catch{warning='未能关联Codex指标，请在任务账单中选择正确会话；未影响DSH派发';}const current=this.store.task(t.id);this.store.putTask({...current,codexAttachWarning:warning,codexAttachAttempted:true});}
 async register(input){
  let codexSnapshot;if(input.codex){if(!this.codexFor)throw Error('Codex只读来源未配置');codexSnapshot=await this.codexFor(input.codex);if(this.store.codexActive().some(w=>w.target.threadId===input.codex.threadId))throw Error('此Codex会话已有活跃统计，请先结束原统计');}
  if(this.stopped)throw Error('采集服务正在关闭');
  if(input.mode==='codex-independent'){if(!codexSnapshot)throw Error('请选择Codex会话');const t=this.store.createCodexOnly(input,input.codex,codexSnapshot);await this.tick();return t;}
  const source=await this.sourceFor(input),s=await source.inspect();const t=this.store.create(input,s);if(codexSnapshot)this.store.linkCodex(t.id,input.codex,codexSnapshot);await this.tick();return t;
 }
 async resume(id){const t=this.store.task(id);if(t.closedAt)throw Error('已结束的观察不能继续');if(t.sessionId&&!this.store.active().some(w=>w.taskId===id)){const source=await this.sourceFor(t);this.store.resume(id,await source.inspect());}const previous=this.store.detail(id).providers.codex.windows.at(-1);if(previous&&!this.store.codexActive().some(w=>w.taskId===id))await this.linkCodex(id,previous.target);await this.tick();return this.store.detail(id);}
 async finish(id){
  const active=this.store.active().filter(w=>w.taskId===id);
  for(const w of active){const s=await this.sample(w);if(s?.running)this.store.mark(w.id,'在DSH执行中结束统计，尚未结算的调用可能未计入');const entry=this.streams.get(w.id);clearTimeout(entry?.timer);entry?.close?.();this.streams.delete(w.id);}
  for(const w of this.store.codexActive().filter(w=>w.taskId===id)){const snapshot=await this.sampleCodex(w);if(snapshot?.running)this.store.markCodex(w.id,'在Codex执行中结束统计，尚未结算的调用可能未计入');}
  this.store.stopCodex(id);this.store.closeTask(id);return this.store.detail(id);
 }
 async stop(){this.stopped=true;clearInterval(this.timer);await this.tickDone;for(const [id,e]of this.streams){clearTimeout(e.timer);e.close?.();this.store.mark(id,'采集服务已关闭；跨重启区间尚待核对');}const queues=[...this.streams.values()].map(e=>e.queue);this.streams.clear();await Promise.allSettled(queues);}
}
