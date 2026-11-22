import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {BindingStore} from './bindings.mjs';
import {receivingStatus,requestReceivingStop} from './receiver.mjs';
import {SessionVisibility} from './session-catalog.mjs';
import {evaluationAction,exportCsv} from './evaluation/api.mjs';
export function observationWarning(observedAt){
 const age=Date.now()-Date.parse(observedAt);
 if(!Number.isFinite(age)||age< -60000)return '会话目录的核对时间不可确认；请核对所选会话和目录。不会仅因时间记录而锁住连接。';
 return age>60*60*1000?'Codex会话目录是此前读取的记录，并非实时列表；请核对所选会话和目录。记录较旧不会阻止连接。':null;
}
export async function startConnections({runtime,html,catalogProvider,dshProvider,workspaces,dispatcher,evaluation}){
 const store=new BindingStore(runtime),key=randomBytes(24).toString('hex'),prefix='/'+key;
 const visibility=new SessionVisibility(runtime);
 let busy=false;
 async function checkIdentity(b){
  if(!b)throw Error('请先保存连接');const catalog=catalogProvider();
  const codex=catalog.threads.find(x=>x.threadId===b.codex.threadId&&x.hostId===b.codex.hostId&&x.readVerified);
  const dsh=(await dshProvider()).find(x=>x.sessionId===b.dsh.sessionId&&x.workspace===b.dsh.workspace);
  if(!codex||!dsh||(b.codex.cwd&&codex.cwd!==b.codex.cwd))throw Error('会话身份或工作目录不匹配，或目标不可读取；停止启用');
  return {codexIdentity:true,dshIdentity:true,codexObservationAt:catalog.observedAt,codexCheckSource:catalog.source,codexLiveChecked:false,codexWarning:observationWarning(catalog.observedAt),dshRunning:dsh.running};
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const origin='http://127.0.0.1:'+server.address().port;
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  if(req.headers.host!==new URL(origin).host||!req.url.startsWith(prefix+'/'))return json(403,{error:'无效的本机连接入口'});
  if(req.headers.origin&&req.headers.origin!==origin)return json(403,{error:'拒绝其他来源'});
  const route=req.url.slice(prefix.length);
  if(req.method==='GET'&&route==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(html));}
  if(req.method==='GET'&&route==='/evaluation'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(path.dirname(html),'evaluation.html')));}
  if(req.method==='GET'&&route.startsWith('/api/evaluation')){
   if(!evaluation)return json(503,{error:'评估服务未配置，原有连接功能不受影响'});
   try{
    const url=new URL(route,origin);
    if(url.pathname==='/api/evaluation')return json(200,{tasks:evaluation.store.list(),warning:evaluation.collector.lastError,scope:'Codex与DSH按各自登记区间分开统计；实际费用须有账单来源，不能用估算代替'});
    if(url.pathname==='/api/evaluation/detail')return json(200,evaluation.store.detail(url.searchParams.get('id')));
    if(url.pathname==='/api/evaluation/export'){
     const rows=evaluation.store.list();res.writeHead(200,{'Content-Type':url.searchParams.get('format')==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="evaluation.'+(url.searchParams.get('format')==='csv'?'csv':'json')+'"'});
     return res.end(url.searchParams.get('format')==='csv'?exportCsv(rows):JSON.stringify({scope:'DSH已登记区间；不含完整消息、凭据与事件正文',tasks:rows},null,2));
    }
    return json(404,{error:'没有此评估入口'});
   }catch{return json(503,{error:'评估账本读取失败，请保留现场；原任务未改变'});}
  }
  if(req.method==='GET'&&route==='/api/state')return json(200,{binding:store.read(),backgroundRouter:false,receiving:receivingStatus(runtime)});
  if(req.method==='GET'&&route==='/api/workspaces')return json(200,{items:workspaces?.catalog()??[]});
  if(req.method==='GET'&&route==='/api/candidates'){
   try{const catalog=catalogProvider();let dsh=[],dshError=null;try{dsh=await dshProvider();}catch(e){dshError='DSH连接不可用：'+e.message;}return json(200,{codex:visibility.visible('codex',catalog.threads),observedAt:catalog.observedAt,dsh:visibility.visible('dsh',dsh),available:{codex:catalog.threads,dsh},dshError,codexWarning:observationWarning(catalog.observedAt),codexSource:catalog.source??'已保存的Codex会话目录，不是本次实时读取'});}catch(e){return json(503,{error:e.message});}
  }
  if(req.method!=='POST')return json(404,{error:'没有此入口'});
  if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))return json(403,{error:'请求来源或类型不符'});
  if(busy)return json(409,{error:'正在处理，请勿重复提交'});
  busy=true;
  try{
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)throw Error('请求过大');}const input=JSON.parse(raw);
   let result;
   if(route==='/api/project-register'){
    if(!workspaces?.registerProject)throw Error('目录登记服务未配置');return json(200,workspaces.registerProject(input));
   }
   if(route==='/api/evaluation'){
    if(!evaluation)throw Error('评估服务未配置');return json(200,await evaluationAction(evaluation,input));
   }
   if(route==='/api/session-visibility'){
    if(!['codex','dsh'].includes(input.kind)||typeof input.hidden!=='boolean')throw Error('会话列表操作无效');
    const rows=input.kind==='codex'?catalogProvider().threads:await dshProvider();
    const row=rows.find(r=>visibility.key(input.kind,r)===input.key);if(!row)throw Error('原生来源未找到此会话，请刷新列表');
    const b=store.read(),bound=input.kind==='codex'?b?.codex:b?.dsh;
    if(input.hidden&&b&&b.state!=='disconnected'&&visibility.key(input.kind,bound)===input.key)throw Error('这是当前绑定会话；请先断开连接，再移出列表。不会停止原生任务。');
    visibility.update(input.kind,row,input.hidden);return json(200,{message:input.hidden?'已从连接器列表移出，原生会话保持不变':'已添加到连接器列表，未发送消息或改变权限'});
   }
   if(route.startsWith('/api/workspace-')){
    if(!workspaces)throw Error('工作区服务尚未配置');
    const op=route.slice('/api/workspace-'.length);
    if(op==='prepare'||op==='open')return json(200,await workspaces.prepare(input.key));
    if(op==='create')return json(200,await workspaces.create(input));
    if(op==='close')return json(200,await workspaces.close());
    return json(404,{error:'没有此工作区操作'});
   }
   if(route==='/api/dispatch'){
    if(!dispatcher)throw Error('任务发送尚未配置');
    return json(200,await dispatcher.send(input));
   }
   if(route==='/api/receiving-stop')return json(200,{receiving:requestReceivingStop(runtime),binding:store.read(),backgroundRouter:false});
   if(route==='/api/save'){
    const catalog=catalogProvider();const codex=visibility.visible('codex',catalog.threads).find(x=>x.threadId===input.codexThreadId&&x.hostId===input.codexHostId);
    const dsh=visibility.visible('dsh',await dshProvider()).find(x=>x.sessionId===input.dshSessionId);
    if(!codex||!dsh)throw Error('请选择已核对目录中的会话');
    result=store.save({name:input.name,mode:input.mode,codex,dsh},input.revision);
   }else if(route==='/api/verify'){
    const b=store.assertRevision(input.revision);if(!b)throw Error('请先保存连接');
    result=store.verify(await checkIdentity(b),input.revision);
   }else if(['/api/enable','/api/pause','/api/disconnect'].includes(route)){
    if(route==='/api/enable')await checkIdentity(store.assertRevision(input.revision));
    result=store.transition(route.slice(5),input.revision);
   }
   else return json(404,{error:'没有此操作'});
   return json(200,{binding:result,backgroundRouter:false});
  }catch(e){return json(400,{error:e.message});}finally{busy=false;}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:'http://127.0.0.1:'+server.address().port+prefix+'/',server,store};
}
