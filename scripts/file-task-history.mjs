// Expose/read the actual completed SDK task in the official Web history.
import fs from 'node:fs';
import path from 'node:path';
import {root,loadConfig} from '../src/config.mjs';
const config=loadConfig(),ready=JSON.parse(fs.readFileSync(config.hostReadyFile,'utf8'));
const auth=await fetch(ready.authUrl,{redirect:'manual'});const cookie=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
async function rpc(method,args){const r=await fetch(ready.url+'/api/'+method,{method:'POST',headers:{cookie,origin:ready.url,'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'file-history-'+method,method,payload:{args}}),signal:AbortSignal.timeout(15000)});const b=await r.json();if(!b.result?.ok)throw Error(JSON.stringify(b));return b.result.value;}
const run=JSON.parse(fs.readFileSync(path.join(root,'.runtime','file-task-evidence','sdk-run.json'),'utf8'));
const list=await rpc('session/list',{_request:{}}),task=list.items.find(s=>s.sessionId===run.sessionId),original=list.items.find(s=>s.sessionId===config.expectedSessionId);
if(!task||task.cwd!==run.workspace||!original)throw Error('原生会话持久化或工程身份不匹配');
const workspace=await rpc('workspace/create',{request:{path:run.workspace}});
const page=await rpc('session/page',{request:{address:{kind:'session',sessionId:task.sessionId},throughSeq:task.projections.asOfSeq,maxMessages:20}});
const events=page.records.map(r=>r.event).filter(e=>e&&['assistant/message','turn/end','tool/result'].includes(e.type)).map(e=>({seq:e.seq,type:e.type,text:e.data.message?.content?.filter(p=>p.type==='text').map(p=>p.text).join('\n'),reason:e.data.reason}));
const result={sessionId:task.sessionId,workspace:workspace.workspace,seq:task.projections.asOfSeq,running:task.running,originalSession:{sessionId:original.sessionId,permissions:original.projections?.values?.permissions,seq:original.projections?.asOfSeq},events};
fs.writeFileSync(path.join(root,'.runtime','file-task-evidence','native-web-history.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({sessionId:task.sessionId,seq:result.seq,running:result.running,workspaceSessions:workspace.workspace.sessionIds,originalSession:result.originalSession,completed:events.filter(e=>e.type==='turn/end').map(e=>e.reason)}));
