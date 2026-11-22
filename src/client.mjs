import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {root,validateHost} from './config.mjs';
export async function connect(config){
 const ready=JSON.parse(fs.readFileSync(config.hostReadyFile,'utf8'));
 const authUrl=validateHost(ready);
 const auth=await fetch(authUrl,{redirect:'manual',signal:AbortSignal.timeout(5000)});
 if(auth.status!==303)throw Error('官方Host认证失败');
 const cookie=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 if(!cookie)throw Error('Host未建立认证Cookie');
 const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});
 const journal=path.join(runtime,'transport.jsonl');
 const log=(data)=>fs.appendFileSync(journal,JSON.stringify({at:new Date().toISOString(),...data})+'\n');
 async function rpc(method,args){
  const r=await fetch(ready.url+'/api/'+method,{method:'POST',headers:{cookie,origin:ready.url,'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}}),signal:AbortSignal.timeout(15000)});
  const b=await r.json();log({method,status:r.status,ok:b.result?.ok===true});
  if(!b.result?.ok)throw Error('官方接口失败：'+JSON.stringify(b.result?.error??b.error??{status:r.status}));return b.result.value;
 }
 async function inspect(){
  const list=await rpc('session/list',{_request:{}});
  const s=list.items.find(x=>x.sessionId===config.expectedSessionId);
  if(!s||path.resolve(s.cwd)!==path.resolve(config.expectedWorkspace))throw Error('目标Session或工作区身份不匹配；停止');
  return s;
 }
 return {
  inspect,
  async hasRunningSessions(){const list=await rpc('session/list',{_request:{}});return list.items.some(s=>s.running);},
  async hasRunningWorkspace(){const list=await rpc('session/list',{_request:{}});return list.items.some(s=>path.resolve(s.cwd??'')===path.resolve(config.expectedWorkspace)&&s.running);},
  async history(maxMessages=30){const s=await inspect();return rpc('session/page',{request:{address:{kind:'session',sessionId:s.sessionId},throughSeq:s.projections.asOfSeq,maxMessages}});},
  async submit(requestId,text){await inspect();return rpc('session/prompt',{request:{sessionId:config.expectedSessionId,requestId,mode:'queue',clientTimeZone:'Asia/Shanghai',content:[{type:'text',text}]}});},
  async candidates(){const list=await rpc('session/list',{_request:{}});return list.items.filter(s=>path.resolve(s.cwd)===path.resolve(config.expectedWorkspace)).map(s=>({sessionId:s.sessionId,title:s.projections?.values?.title??'新会话',workspace:s.cwd,running:s.running}));},
  async status(){
   const s=await inspect();
   const page=await rpc('session/page',{request:{address:{kind:'session',sessionId:s.sessionId},throughSeq:s.projections.asOfSeq,maxMessages:4}});
   return {sessionId:s.sessionId,workspace:s.cwd,running:s.running,seq:s.projections.asOfSeq,usage:s.projections.values.tokenUsage,messages:page.records.filter(r=>r.event?.type==='assistant/message').map(r=>({seq:r.event.seq,text:r.event.data.message.content.filter(p=>p.type==='text').map(p=>p.text).join('\n')}))};
  },
  async configure(rule){
   const s=await inspect();if(s.running)throw Error('会话正在运行或等待回答；不插队');
   const hash=createHash('sha256').update(rule).digest('hex');
   const requestId='native-interaction-'+hash.slice(0,20);
   // Cross-copy protection: inspect original native history before a new configure.
   const page=await rpc('session/page',{request:{address:{kind:'session',sessionId:s.sessionId},throughSeq:s.projections.asOfSeq,maxMessages:100}});
   if(JSON.stringify(page).includes(requestId))throw Error('原生历史已有该规则请求；先核对，不重复发送');
   if(fs.existsSync(journal)&&fs.readFileSync(journal,'utf8').includes(requestId))throw Error('本地已有发送尝试；先核对，不重发');
   const text=rule+'\n\n本次仅设置协作方式，不进行开发或读写文件。请用原生ask_user_question询问“以后在已授权任务范围内，希望怎样推进？”，选项为“自主推进（推荐）”“新委派先确认”“暂停自动委派”。说明仅影响当前验证会话，不授予新权限。等待真人回答，不能代选或将未答当同意。答复后简明确认并结束。';
   log({kind:'prompt-attempt',sessionId:s.sessionId,requestId,ruleHash:hash});
   try{const receipt=await rpc('session/prompt',{request:{sessionId:s.sessionId,requestId,mode:'queue',clientTimeZone:'Asia/Shanghai',content:[{type:'text',text}]}});log({kind:'receipt',requestId,receipt});return receipt;}
   catch(error){log({kind:'unconfirmed-attempt',requestId});throw error;}
  }
 };
}
