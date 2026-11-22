import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {root,loadConfig} from './config.mjs';
import {Workspaces} from './workspaces.mjs';
import {webApi} from './web-api.mjs';

const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const descriptions={
 'turn-ended':'DSH 本轮已结束，需复核成果；不等于任务验收通过',
 'technical-question':'DSH 有待答技术问题，请运行 npm run inbox 读取并处理',
 'approval-required':'DSH 请求原生批准，请制作人在 DSH 客户端查看，不代替批准',
 idle:'DSH 当前没有活跃回合；不等于任务已完成，不应重复等待或重复派发',
 timeout:'本次等待到时，尚无需要处理的新反馈；不是任务失败，不重发任务',
 cancelled:'已取消监听；DSH 任务未被停止',
 disconnected:'事件连接中断，执行结果待核对；未自动重连或重发',
 'binding-changed':'连接已暂停、断开或修改，停止监听；未停止原 DSH 任务',
 'identity-mismatch':'原生会话或工程身份不匹配，停止监听',
 'history-gap':'新增记录超出本次历史窗口，需要核对历史，不能据此判定完成',
 'protocol-error':'原生事件格式或序号不连续，停止并核对，不猜测执行状态',
 'local-state-error':'本地状态无法读取，保留现场并停止监听',
};

// Dependency-injected for no-model regression. Only session/list and session/follow are used.
export async function waitForFeedback({runtime,expectedThread,expectedWorkspace,rpcFor,waitMs=900000,afterSeq,signal,localCheckMs=1000}){
 if(typeof expectedThread!=='string'||!expectedThread||typeof expectedWorkspace!=='string'||!path.isAbsolute(expectedWorkspace)||!Number.isInteger(waitMs)||waitMs<1||waitMs>900000||
    (afterSeq!==undefined&&(!Number.isInteger(afterSeq)||afterSeq<0)))throw Error('等待参数无效');
 const read=name=>{const file=path.join(runtime,name);return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;};
 const binding=read('binding.json');
 if(!binding||binding.codex?.threadId!==expectedThread||!samePath(binding.dsh?.workspace,expectedWorkspace))throw Error('指定会话或工程与绑定不符');
 const fingerprint=b=>JSON.stringify([b?.id,b?.revision,b?.codex,b?.dsh,b?.state,b?.mode]);
 const original=fingerprint(binding),startedAt=new Date().toISOString(),started=Date.now();
 let cursor=afterSeq??null,lastEventType=null,receivedFrames=0,rpcCalls=0;
 const result=(kind,extra={})=>({kind,message:descriptions[kind],sessionId:binding.dsh.sessionId,codexThreadId:expectedThread,
  startedAt,returnedAt:new Date().toISOString(),waitedMs:Date.now()-started,cursor,lastEventType,receivedFrames,rpcCalls,modelCalls:0,...extra});
 const local=()=>{
  const current=read('binding.json');
  if(fingerprint(current)!==original||current?.state!=='enabled'||current?.mode==='paused')return result('binding-changed');
  const questions=read('questions.json')??[];
  if(!Array.isArray(questions))throw Error('收件箱损坏');
  const pending=questions.filter(q=>q.bindingId===binding.id&&q.sessionId===binding.dsh.sessionId&&q.codex?.threadId===expectedThread&&q.state==='pending');
  if(pending.length)return result('technical-question',{questionIds:pending.map(q=>q.id)});
 };
 if(signal?.aborted)return result('cancelled');
 const initial=local();if(initial)return initial;
 const rpc=await rpcFor(binding.dsh);
 const inspect=async()=>{rpcCalls++;const list=await rpc('session/list',{_request:{}});return list.items.find(s=>s.sessionId===binding.dsh.sessionId);};
 const row=await inspect();
 if(!row||!samePath(row.cwd,expectedWorkspace))return result('identity-mismatch');
 const baseline=afterSeq??row.projections?.asOfSeq;
 if(!Number.isInteger(baseline))return result('protocol-error');
 cursor=baseline;
 return new Promise(resolve=>{
  let done=false,closeStream,interval,timer,openingTimer,opened=false;
  const cleanup=()=>{clearInterval(interval);clearTimeout(timer);clearTimeout(openingTimer);signal?.removeEventListener('abort',abort);closeStream?.();};
  const finish=value=>{if(done)return;done=true;cleanup();resolve(value);};
  const checkedFinish=value=>{try{finish(local()??value);}catch{finish(result('local-state-error'));}};
  const abort=()=>finish(result('cancelled'));
  const event=e=>{
   if(!e||!Number.isInteger(e.seq)||typeof e.type!=='string'){checkedFinish(result('protocol-error'));return;}
   if(e.seq<=cursor)return;
   if(e.seq!==cursor+1){checkedFinish(result('history-gap'));return;}
   cursor=e.seq;lastEventType=e.type;
   if(e.type==='turn/end')checkedFinish(result('turn-ended',{reasonKind:typeof e.data?.reason?.kind==='string'?e.data.reason.kind:'unknown'}));
   else if(e.type==='approval/asked')checkedFinish(result('approval-required'));
   // Tool failure alone may be self-repaired by DSH; never turn it into task failure.
  };
  const onFrame=frame=>{
   if(done)return;receivedFrames++;
   try{
    const change=local();if(change){finish(change);return;}
    if(frame?.type==='snapshot'){
     if(opened||frame.header?.id!==binding.dsh.sessionId||!samePath(frame.header?.cwd,expectedWorkspace)){finish(result('identity-mismatch'));return;}
     opened=true;clearTimeout(openingTimer);
     if(!Number.isInteger(frame.cursor)||frame.cursor<cursor||!Array.isArray(frame.records)){finish(result('protocol-error'));return;}
     for(const record of frame.records){if(record.type!=='event'){finish(result('protocol-error'));return;}event(record.event);if(done)return;}
     if(cursor!==frame.cursor){finish(result('history-gap'));return;}
     // One post-subscription check closes the race where a turn ended before opening.
     // It is not periodic remote polling; later changes come only from the stream.
     inspect().then(s=>{
      if(done)return;
      if(!s||!samePath(s.cwd,expectedWorkspace))checkedFinish(result('identity-mismatch'));
      else if(!s.running)checkedFinish(result('idle'));
     }).catch(()=>checkedFinish(result('disconnected')));
    }else if(frame?.type==='event'&&opened)event(frame.event);
    else checkedFinish(result('protocol-error'));
   }catch{finish(result('local-state-error'));}
  };
  interval=setInterval(()=>{try{const change=local();if(change)finish(change);}catch{finish(result('local-state-error'));}},localCheckMs);
  timer=setTimeout(()=>checkedFinish(result('timeout')),waitMs);
  openingTimer=setTimeout(()=>checkedFinish(result('disconnected')),Math.min(waitMs,10000));
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return;}
  try{closeStream=rpc.followSession({onFrame,onClose:()=>checkedFinish(result('disconnected'))});if(done)closeStream?.();}
  catch{checkedFinish(result('disconnected'));}
 });
}

// Importable from Codex's Node REPL: the awaited tool stays pending while the local
// program listens. No model prompt is sent and no live settings/session is changed.
export async function waitForConfiguredFeedback(options){
 const config=loadConfig(),workspaces=new Workspaces(config);
 return waitForFeedback({...options,runtime:path.join(root,'.runtime'),rpcFor:async dsh=>{
  const target=workspaces.configFor(dsh),rpc=await webApi(target.hostReadyFile);
  const WebSocket=createRequire(config.officialHost.entry)('ws');
  const follow=rpc.followSession;
  rpc.followSession=callbacks=>follow(WebSocket,dsh.sessionId,callbacks);
  return rpc;
 }});
}
